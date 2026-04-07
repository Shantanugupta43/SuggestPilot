/**
 * Unit tests — SessionTracker
 * src/services/session-tracker.js
 *
 * SessionTracker stores query history in chrome.storage.local.
 * All storage interactions go through the chrome mock (chrome-mock.js).
 */

describe('SessionTracker', () => {
  let tracker;

  beforeEach(async () => {
    // Re-import singleton fresh so state from previous tests cannot leak
    jest.resetModules();
    const mod = await import('../../../src/services/session-tracker.js');
    tracker = mod.default;
  });

  // ── recordQuery ────────────────────────────────────────────────────────────

  describe('recordQuery()', () => {
    it('persists a query to storage', async () => {
      await tracker.recordQuery('react hooks tutorial');
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    it('ignores empty / blank queries', async () => {
      await tracker.recordQuery('');
      await tracker.recordQuery('  ');
      await tracker.recordQuery(null);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('ignores single-character queries', async () => {
      await tracker.recordQuery('a');
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('stores at most MAX_QUERIES entries', async () => {
      // Record 25 queries (MAX_QUERIES = 20)
      for (let i = 0; i < 25; i++) {
        await tracker.recordQuery(`query number ${i}`);
      }
      const { sessionIntent } = await chrome.storage.local.get('sessionIntent');
      expect(sessionIntent.queries.length).toBeLessThanOrEqual(20);
    });

    it('builds a recentThread after recording queries', async () => {
      await tracker.recordQuery('react hooks');
      await tracker.recordQuery('useEffect cleanup');
      const { sessionIntent } = await chrome.storage.local.get('sessionIntent');
      expect(sessionIntent.recentThread).toContain('react hooks');
      expect(sessionIntent.recentThread).toContain('useEffect cleanup');
    });

    it('builds a sessionSummary from repeated keywords', async () => {
      await tracker.recordQuery('react performance optimization');
      await tracker.recordQuery('react memo useMemo');
      await tracker.recordQuery('react virtualization');
      const { sessionIntent } = await chrome.storage.local.get('sessionIntent');
      expect(sessionIntent.sessionSummary).toMatch(/Researching:/i);
      expect(sessionIntent.sessionSummary).toContain('react');
    });
  });

  // ── getIntentContext ───────────────────────────────────────────────────────

  describe('getIntentContext()', () => {
    it('returns empty strings when no queries have been recorded', async () => {
      const ctx = await tracker.getIntentContext();
      expect(ctx).toEqual({ sessionSummary: '', recentThread: '' });
    });

    it('returns the stored summary and thread after queries', async () => {
      await tracker.recordQuery('typescript generics');
      await tracker.recordQuery('typescript utility types');
      const ctx = await tracker.getIntentContext();
      expect(ctx.sessionSummary).toMatch(/Researching/);
      expect(ctx.recentThread).toContain('typescript generics');
    });

    it('handles chrome.storage.local.get rejection gracefully', async () => {
      chrome.storage.local.get.mockRejectedValueOnce(new Error('storage error'));
      const ctx = await tracker.getIntentContext();
      expect(ctx).toEqual({ sessionSummary: '', recentThread: '' });
    });
  });

  // ── clearSession ───────────────────────────────────────────────────────────

  describe('clearSession()', () => {
    it('removes all session data from storage', async () => {
      await tracker.recordQuery('some query');
      await tracker.clearSession();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('sessionIntent');
    });

    it('returns empty context after clearing', async () => {
      await tracker.recordQuery('topic A');
      await tracker.clearSession();
      const ctx = await tracker.getIntentContext();
      expect(ctx.sessionSummary).toBe('');
    });
  });

  // ── session expiry ─────────────────────────────────────────────────────────

  describe('session expiry', () => {
    it('starts a fresh session when stored session is stale (> SESSION_TTL_MS)', async () => {
      // Use the actual TTL constant so this test stays correct if the TTL changes
      const staleTime = Date.now() - (tracker.SESSION_TTL_MS + 60 * 1000); // TTL + 1 min
      __seedStorage({
        sessionIntent: {
          queries: [{ text: 'old query', suggestions: [], timestamp: staleTime }],
          sessionSummary: 'Researching: old',
          recentThread: 'old query',
          startedAt: staleTime,
          updatedAt: staleTime
        }
      });

      await tracker.recordQuery('fresh query');
      const ctx = await tracker.getIntentContext();
      // Summary should only contain the new query, not the stale one
      expect(ctx.recentThread).toBe('fresh query');
      expect(ctx.recentThread).not.toContain('old query');
    });

    it('does NOT reset a session that is still within SESSION_TTL_MS', async () => {
      // 1 minute before expiry — session should be preserved
      const recentTime = Date.now() - (tracker.SESSION_TTL_MS - 60 * 1000);
      __seedStorage({
        sessionIntent: {
          queries: [{ text: 'active query', suggestions: [], timestamp: recentTime }],
          sessionSummary: 'Researching: active',
          recentThread: 'active query',
          startedAt: recentTime,
          updatedAt: recentTime
        }
      });

      const ctx = await tracker.getIntentContext();
      expect(ctx.recentThread).toContain('active query');
    });
  });

  // ── _buildRecentThread (private, tested via public API) ────────────────────

  describe('_buildRecentThread()', () => {
    it('joins up to the last 5 queries with " → "', () => {
      const queries = [
        { text: 'q1' }, { text: 'q2' }, { text: 'q3' },
        { text: 'q4' }, { text: 'q5' }, { text: 'q6' }
      ];
      const thread = tracker._buildRecentThread(queries);
      // Should include last 5: q2 → q3 → q4 → q5 → q6
      expect(thread).toBe('q2 → q3 → q4 → q5 → q6');
    });
  });

  // ── _buildSessionSummary (private, tested via public API) ─────────────────

  describe('_buildSessionSummary()', () => {
    it('returns empty string for no queries', () => {
      expect(tracker._buildSessionSummary([])).toBe('');
    });

    it('filters out stop words', () => {
      const queries = [{ text: 'how to use the best react hooks' }];
      const summary = tracker._buildSessionSummary(queries);
      // "how", "to", "the", "best", "use" are stop words
      expect(summary).not.toMatch(/\b(how|to|the|best|use)\b/);
    });

    it('lists at most 6 keywords', () => {
      // Feed 10 unique keywords
      const queries = [
        { text: 'alpha beta gamma delta epsilon zeta eta theta iota kappa' }
      ];
      const summary = tracker._buildSessionSummary(queries);
      const keywords = summary.replace('Researching: ', '').split(', ');
      expect(keywords.length).toBeLessThanOrEqual(6);
    });
  });
});
