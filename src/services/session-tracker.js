/**
 * Session Tracker
 * Tracks the user's research intent across queries within a browsing session.
 * Builds a rolling summary and recent thread used by groq-service to produce
 * context-aware, session-continuity suggestions.
 *
 * Storage key: 'sessionIntent'
 *
 * @typedef {Object} SessionData
 * @property {Array<{text: string, suggestions: string[], timestamp: number}>} queries - Recorded queries
 * @property {string} sessionSummary - Human-readable research summary
 * @property {string} recentThread - Arrow-separated string of recent queries
 * @property {number} startedAt - Session start timestamp
 * @property {number} updatedAt - Last activity timestamp
 *
 * @typedef {Object} IntentContext
 * @property {string} sessionSummary - Research summary string
 * @property {string} recentThread - Recent query thread
 *
 * Public API (all async):
 *   recordQuery(queryText, suggestions)  → void
 *   getIntentContext()                   → IntentContext
 *   clearSession()                       → void
 */

import { SESSION_TTL_MS, MAX_QUERIES, SUMMARY_REBUILD_INTERVAL, MAX_RECENT_THREAD, MAX_THREAD_TEXT_LENGTH } from '../utils/constants.js';

/**
 * Tracks research session intent for context-aware suggestions.
 */
class SessionTracker {
  constructor() {
    /** @type {string} */
    this.STORAGE_KEY = 'sessionIntent';
    /** @type {number} */
    this.SESSION_TTL_MS = SESSION_TTL_MS;
    /** @type {number} */
    this.MAX_QUERIES = MAX_QUERIES;
    /** @type {number} */
    this.SUMMARY_REBUILD_INTERVAL = SUMMARY_REBUILD_INTERVAL;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Record a new query into the session and update the intent summary.
   * @param {string} queryText - The text the user typed
   * @param {Array<string|{text: string}>} suggestions - Suggestions returned for this query
   * @returns {Promise<void>}
   */
  async recordQuery(queryText, suggestions = []) {
    if (!queryText || typeof queryText !== 'string') return;
    const text = queryText.trim();
    if (text.length < 2) return;

    try {
      const session = await this._loadSession();

      session.queries.push({
        text,
        suggestions: (suggestions || []).slice(0, 3).map(s =>
          typeof s === 'string' ? s : (s.text || '')
        ),
        timestamp: Date.now()
      });

      // Keep rolling window
      if (session.queries.length > this.MAX_QUERIES) {
        session.queries = session.queries.slice(-this.MAX_QUERIES);
      }

      // Rebuild the human-readable thread and summary
      session.recentThread = this._buildRecentThread(session.queries);
      session.sessionSummary = this._buildSessionSummary(session.queries);
      session.updatedAt = Date.now();

      await this._saveSession(session);
    } catch (error) {
      console.error('SessionTracker.recordQuery error:', error);
    }
  }

  /**
   * Return the intent context object expected by groq-service.
   * @returns {Promise<IntentContext>}
   */
  async getIntentContext() {
    try {
      const session = await this._loadSession();
      return {
        sessionSummary: session.sessionSummary || '',
        recentThread: session.recentThread || ''
      };
    } catch (error) {
      console.error('SessionTracker.getIntentContext error:', error);
      return { sessionSummary: '', recentThread: '' };
    }
  }

  /**
   * Wipe the stored session.
   * @returns {Promise<void>}
   */
  async clearSession() {
    try {
      await chrome.storage.local.remove(this.STORAGE_KEY);
    } catch (error) {
      console.error('SessionTracker.clearSession error:', error);
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Load session from storage, creating a fresh one if missing or expired.
   * @returns {Promise<SessionData>}
   * @private
   */
  async _loadSession() {
    try {
      const stored = await chrome.storage.local.get(this.STORAGE_KEY);
      const session = stored[this.STORAGE_KEY];

      if (!session || !session.startedAt) {
        return this._freshSession();
      }

      // Expire stale sessions
      const age = Date.now() - (session.updatedAt || session.startedAt);
      if (age > this.SESSION_TTL_MS) {
        return this._freshSession();
      }

      // Ensure required fields exist (backwards compat)
      return {
        queries: session.queries || [],
        sessionSummary: session.sessionSummary || '',
        recentThread: session.recentThread || '',
        startedAt: session.startedAt,
        updatedAt: session.updatedAt || session.startedAt
      };
    } catch (error) {
      return this._freshSession();
    }
  }

  /**
   * Save session to chrome.storage.local.
   * @param {SessionData} session - The session object to persist
   * @returns {Promise<void>}
   * @private
   */
  async _saveSession(session) {
    await chrome.storage.local.set({ [this.STORAGE_KEY]: session });
  }

  /**
   * Create a fresh empty session object.
   * @returns {SessionData}
   * @private
   */
  _freshSession() {
    return {
      queries: [],
      sessionSummary: '',
      recentThread: '',
      startedAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  /**
   * Build a short readable string of the last queries.
   * Used as THREAD: in the groq prompt.
   * @param {Array<{text: string}>} queries - Array of query objects
   * @returns {string} Arrow-separated query thread
   * @private
   */
  _buildRecentThread(queries) {
    return queries
      .slice(-MAX_RECENT_THREAD)
      .map(q => q.text.slice(0, 60))
      .join(' → ');
  }

  /**
   * Build a one-line summary of what the user is researching this session.
   * Uses simple keyword frequency — no API call needed.
   * @param {Array<{text: string}>} queries - Array of query objects
   * @returns {string} Summary like "Researching: react, hooks, performance"
   * @private
   */
  _buildSessionSummary(queries) {
    if (queries.length === 0) return '';

    // Collect all words, strip noise, count frequency
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'in', 'on', 'at', 'to', 'for', 'of', 'and',
      'or', 'how', 'what', 'why', 'when', 'where', 'do', 'does', 'can',
      'i', 'my', 'me', 'with', 'vs', 'vs.', 'between', 'difference',
      'best', 'good', 'new', 'using', 'use', 'get', 'will', 'it', 'this',
      'that', 'from', 'about', 'into', 'are', 'be', 'not', 'no', 'without'
    ]);

    const freq = {};
    for (const q of queries) {
      const words = q.text.toLowerCase().match(/\b[a-z][a-z0-9+#.]{1,20}\b/g) || [];
      for (const word of words) {
        if (!stopWords.has(word)) {
          freq[word] = (freq[word] || 0) + 1;
        }
      }
    }

    const topKeywords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([word]) => word);

    if (topKeywords.length === 0) return '';
    return `Researching: ${topKeywords.join(', ')}`;
  }
}

const sessionTracker = new SessionTracker();
export default sessionTracker;