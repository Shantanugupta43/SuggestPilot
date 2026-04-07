/**
 * Groq API Service
 * Handles API calls, prompt building, response parsing, and suggestion validation.
 *
 * @typedef {Object} Suggestion
 * @property {string} text - The suggestion text
 * @property {string} derivation - Explanation of where the suggestion came from
 *
 * @typedef {Object} SuggestionResponse
 * @property {string} reason - Why these suggestions were generated
 * @property {Suggestion[]} suggestions - Array of suggestions
 * @property {boolean} [isFormFill] - Whether this is a form-fill response
 * @property {string} [error] - Error message if any
 *
 * @typedef {Object} FieldMeta
 * @property {string} fieldType - Classified field type
 * @property {string} fieldLabel - Human-readable label
 * @property {Array<{value: string, source: string, confidence: number}>} candidates - Pre-fill candidates
 * @property {boolean} isFormFill - Whether this is a form field
 * @property {string} [pageTitle] - Current page title
 * @property {string} [pageUrl] - Current page URL
 *
 * @typedef {Object} GenerationContext
 * @property {string} active_input_text - Current input value
 * @property {string} [page_type] - Detected page type
 * @property {Object} [current_page] - Current page info
 * @property {Array} [active_tabs] - Open tabs context
 * @property {Array} [recent_history] - Browsing history context
 * @property {Object} [sessionIntent] - Session intent context
 * @property {FieldMeta} [fieldMeta] - Form field metadata
 */

import configManager from '../config/config-manager.js';
import {
  GROQ_BASE_URL, GROQ_MODEL, MAX_TOKENS, TEMPERATURE, TOP_P,
  TEST_MAX_TOKENS, TEST_TEMPERATURE, MAX_SUGGESTIONS,
  MAX_THREAD_TEXT_LENGTH,
  MIN_SUGGESTION_LENGTH, MAX_SUGGESTION_LENGTH,
  PROMPT_TAB_COUNT, PROMPT_HISTORY_COUNT, PROMPT_TITLE_SLICE, PROMPT_PAGE_TITLE_SLICE
} from '../utils/constants.js';

/**
 * Groq API service for generating context-aware suggestions.
 */
class GroqService {
  constructor() {
    /** @type {string} */
    this.baseURL = GROQ_BASE_URL;
  }

  /**
   * Resolve the model from configManager, falling back to the default.
   * @returns {string} The model identifier
   * @private
   */
  _resolveModel() {
    try {
      return configManager.get('model') || GROQ_MODEL;
    } catch {
      return GROQ_MODEL;
    }
  }

  /**
   * Generate suggestions based on the given context.
   * Handles both form-fill mode (local candidates) and AI mode (Groq API).
   * @param {GenerationContext} context - The generation context
   * @returns {Promise<SuggestionResponse>}
   */
  async generateSuggestions(context) {
    try {
      const apiKey = configManager.getApiKey();

      // ── Form-fill mode:
      const skipAiTypes = new Set(['os', 'browser', 'linkedin_url', 'github_url', 'version']);
      const hasReadyCandidates =
        context.fieldMeta?.candidates?.length > 0 &&
        (skipAiTypes.has(context.fieldMeta.fieldType) ||
          context.fieldMeta.candidates.every(c => c.confidence >= 0.9));

      if (hasReadyCandidates) {
        return this._buildFormFillResponse(context.fieldMeta);
      }

      // ── Form field detected but needs AI to generate/augment suggestions ───
      const prompt = context.fieldMeta?.fieldType
        ? this.buildFormFieldPrompt(context)
        : this.buildContextAwarePrompt(context);

      const systemPrompt = context.fieldMeta?.fieldType
        ? this.getFormFillSystemPrompt()
        : this.getContextAwareSystemPrompt();

      const result = await this.callWithRetry(apiKey, prompt, systemPrompt);
      return context.fieldMeta?.fieldType
        ? { ...result, isFormFill: true }
        : result;
    } catch (error) {
      console.error('Groq API error:', error);
      return { reason: 'Error generating suggestions', suggestions: [], error: error.message };
    }
  }

  /**
   * Build a form-fill response directly from local candidates (no API call needed).
   * @param {FieldMeta} fieldMeta - Form field metadata with candidates
   * @returns {SuggestionResponse}
   * @private
   */
  _buildFormFillResponse(fieldMeta) {
    const suggestions = fieldMeta.candidates.map(c => ({
      text: c.value,
      derivation: `Auto-filled from ${c.source}`
    }));

    return {
      reason: `Smart fill for "${fieldMeta.fieldLabel}"`,
      suggestions,
      isFormFill: true
    };
  }

  /**
   * Call the Groq API with automatic retry on 429.
   * @param {string} apiKey - Groq API key
   * @param {string} prompt - User prompt text
   * @param {string} systemPrompt - System prompt text
   * @param {number} [attempt] - Current retry attempt
   * @returns {Promise<SuggestionResponse>}
   * @private
   */
  async callWithRetry(apiKey, prompt, systemPrompt, attempt = 0) {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this._resolveModel(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        top_p: TOP_P
      })
    });

    if (response.status === 429 && attempt === 0) {
      const retryAfter = parseFloat(response.headers.get('retry-after') || '2');
      console.warn(`Rate limited, retrying in ${retryAfter}s...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return this.callWithRetry(apiKey, prompt, systemPrompt, 1);
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No response content from Groq');

    return this.parseResponse(content);
  }

  // ─── Prompt builders ───────────────────────────────────────────────────────

  /**
   * Build a standard context-aware prompt with session intent, tabs, and history.
   * @param {GenerationContext} context - The generation context
   * @returns {string} Token-efficient prompt string
   */
  buildContextAwarePrompt(context) {
    const input = context.active_input_text || '';
    const parts = [`Q:"${input}"`];

    // Session intent (the researching thread) — highest signal
    if (context.sessionIntent?.sessionSummary) {
      parts.push(`SESSION:${context.sessionIntent.sessionSummary}`);
    }
    if (context.sessionIntent?.recentThread) {
      // Truncate to keep tokens tight
      const thread = context.sessionIntent.recentThread.slice(0, MAX_THREAD_TEXT_LENGTH);
      parts.push(`THREAD:${thread}`);
    }

    // Other tabs — PROMPT_TAB_COUNT max
    if (context.active_tabs?.length > 0) {
      const tabs = context.active_tabs
        .slice(0, PROMPT_TAB_COUNT)
        .map(t => `"${t.title.slice(0, PROMPT_TITLE_SLICE)}"`)
        .join(', ');
      parts.push(`TABS:${tabs}`);
    }

    // Recent history — PROMPT_HISTORY_COUNT max
    if (context.recent_history?.length > 0) {
      const hist = context.recent_history
        .slice(0, PROMPT_HISTORY_COUNT)
        .map(t => `"${t.title.slice(0, PROMPT_TITLE_SLICE)}"`)
        .join(', ');
      parts.push(`HIST:${hist}`);
    }

    return parts.join('\n');
  }

  /**
   * Build a form-field specific prompt with field type, label, and known values.
   * @param {GenerationContext} context - The generation context
   * @returns {string} Token-efficient prompt string
   */
  buildFormFieldPrompt(context) {
    const fieldType = context.fieldMeta?.fieldType || 'unknown';
    const fieldLabel = context.fieldMeta?.fieldLabel || 'field';
    const currentValue = context.active_input_text || '';
    const parts = [
      `FIELD_TYPE:${fieldType}`,
      `FIELD_LABEL:"${fieldLabel}"`,
      `CURRENT_VALUE:"${currentValue}"`
    ];

    // If we already have some tab-based candidates, pass them as hints
    if (context.fieldMeta?.candidates?.length > 0) {
      const hints = context.fieldMeta.candidates
        .map(c => `"${c.value}" (from ${c.source})`)
        .join(', ');
      parts.push(`KNOWN_VALUES:${hints}`);
    }

    // Include page context for issue_subject
    if (context.fieldMeta?.pageTitle) {
      parts.push(`PAGE_TITLE:"${context.fieldMeta.pageTitle.slice(0, PROMPT_PAGE_TITLE_SLICE)}"`);
    }

    if (context.sessionIntent?.sessionSummary) {
      parts.push(`SESSION:${context.sessionIntent.sessionSummary}`);
    }
    if (context.active_tabs?.length > 0) {
      const tabs = context.active_tabs
        .slice(0, PROMPT_TAB_COUNT)
        .map(t => `"${t.title.slice(0, PROMPT_TITLE_SLICE)}"`)
        .join(', ');
      parts.push(`TABS:${tabs}`);
    }

    return parts.join('\n');
  }

  // ─── System prompts ────────────────────────────────────────────────────────

  /**
   * Get the system prompt for context-aware search suggestions.
   * @returns {string} System prompt text
   */
  getContextAwareSystemPrompt() {
    return `Autocomplete assistant. Complete the user's query into a full natural question or search phrase using context from their session research thread (SESSION, THREAD), open tabs (TABS) and history (HIST).

Rules:
- Output ONLY valid JSON, no markdown
- If SESSION/THREAD present: suggestion[0] should continue or deepen that research thread
- suggestion[1] from TABS or HIST context
- suggestion[2] flexible/creative completion
- Make completions full sentences/questions like a real search query (10-15 words)
- Don't just finish the word — complete the whole thought

Format:
{"reason":"brief","suggestions":[{"text":"full natural question or search phrase","derivation":"source"},{"text":"full natural question or search phrase","derivation":"source"},{"text":"full natural question or search phrase","derivation":"source"}]}`;
  }

  /**
   * Get the system prompt for form-fill suggestions.
   * @returns {string} System prompt text
   */
  getFormFillSystemPrompt() {
    return `Form-fill assistant. The user is filling in a form field. Suggest 2-3 appropriate values for the given field type using context from their open tabs and session.

Rules:
- Output ONLY valid JSON, no markdown
- Suggest realistic, concise values appropriate for the field type
- Draw from TABS context when available (e.g. LinkedIn tab for job_title/company)
- For OS/browser fields, use standard formats like "Windows 11" or "Chrome 120"
- Never suggest passwords, tokens, PINs, or financial data

Format:
{"reason":"Smart form fill","suggestions":[{"text":"suggested value","derivation":"source of this suggestion"},{"text":"alternative value","derivation":"source"}]}`;
  }

  // ─── Response parsing ──────────────────────────────────────────────────────

  /**
   * Parse a JSON string and return structured suggestion data.
   * Returns null if the string is not valid JSON or lacks suggestions.
   * @param {string} jsonString - JSON string to parse
   * @returns {SuggestionResponse|null}
   * @private
   */
  _parseAndValidate(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
          const suggestions = this.validateSuggestions(parsed.suggestions);
          const normalized = suggestions.map(s => ({
            text: s.text || s,
            derivation: s.derivation || 'Based on context'
          }));
          const validated = this.validateSuggestionOrdering(normalized);
          if (validated.length > 0) {
            return {
              reason: parsed.reason || 'Based on your browsing context',
              suggestions: validated
            };
          }
        }
      }
    } catch {
      // Invalid JSON or unexpected structure
    }
    return null;
  }

  /**
   * Parse a JSON string and return structured suggestion data.
   * @param {string} content - Raw response content (may include markdown)
   * @returns {SuggestionResponse} Parsed suggestions or empty fallback
   */
  parseResponse(content) {
    let cleaned = content.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '');
    cleaned = cleaned.replace(/```\s*$/, '');
    cleaned = cleaned.trim();

    // Try direct parse first
    const directResult = this._parseAndValidate(cleaned);
    if (directResult) return directResult;

    // Fallback: extract JSON block via regex
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const regexResult = this._parseAndValidate(jsonMatch[0]);
      if (regexResult) return regexResult;
    }

    console.error('AI did not return proper JSON format');
    return {
      reason: 'Could not parse AI response',
      suggestions: []
    };
  }

  /**
   * Validate and normalize an array of raw suggestions.
   * Filters by length, removes invalid text, caps to MAX_SUGGESTIONS.
   * @param {Array<string|Object>} suggestions - Raw suggestion items
   * @returns {Suggestion[]} Normalized suggestions array
   */
  validateSuggestions(suggestions) {
    if (!Array.isArray(suggestions)) return [];
    return suggestions
      .map(s => {
        if (typeof s === 'object' && s !== null) {
          const text = s.text || s.suggestion;
          const derivation = s.derivation || s.explanation || s.reason;
          if (text) return { text: String(text).trim(), derivation: derivation ? String(derivation).trim() : 'Based on context' };
        }
        if (typeof s === 'string') return { text: s.trim(), derivation: 'Based on context' };
        return null;
      })
      .filter(s => {
        if (!s || !s.text) return false;
        const text = s.text;
        if (text.length < MIN_SUGGESTION_LENGTH || text.length > MAX_SUGGESTION_LENGTH) return false;
        if (/^[{}\[\]"'`]+$/.test(text)) return false;
        if (text.toLowerCase().includes('reason:')) return false;
        if (text.toLowerCase().includes('suggestions:')) return false;
        return true;
      })
      .slice(0, MAX_SUGGESTIONS);
  }

  /**
   * Prefix derivation labels with Session/Context/Smart based on position.
   * @param {Suggestion[]} suggestions - Array of suggestion objects
   * @returns {Suggestion[]} Suggestions with enhanced derivation labels
   */
  validateSuggestionOrdering(suggestions) {
    if (!Array.isArray(suggestions) || suggestions.length === 0) return suggestions;
    return suggestions.map((suggestion, index) => {
      let sourceLabel = ['Session', 'Context', 'Smart'][index] || 'Smart';
      const derivation = suggestion.derivation || '';
      const enhancedDerivation = derivation.startsWith(sourceLabel)
        ? derivation
        : `${sourceLabel}: ${derivation}`;
      return { ...suggestion, derivation: enhancedDerivation };
    });
  }

  /**
   * Test the Groq API connection with a minimal request.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async testConnection() {
    try {
      const apiKey = configManager.getApiKey();
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this._resolveModel(),
          messages: [
            { role: 'system', content: 'Respond with only: {"status": "ok"}' },
            { role: 'user', content: 'test' }
          ],
          max_tokens: TEST_MAX_TOKENS,
          temperature: TEST_TEMPERATURE
        })
      });

      if (!response.ok) {
        let errorMessage = `API Error: ${response.status}`;
        try {
          const errorBody = await response.json();
          if (response.status === 401) {
            errorMessage = 'Invalid API key';
          } else if (response.status === 429) {
            errorMessage = 'Rate limited — try again later';
          } else if (errorBody.error?.message) {
            errorMessage = errorBody.error.message;
          }
        } catch {
          // If we can't parse the error body, fall back to status-based message
          if (response.status === 401) errorMessage = 'Invalid API key';
          else if (response.status === 429) errorMessage = 'Rate limited — try again later';
        }
        return { success: false, error: errorMessage };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: `Connection failed: ${error.message}` };
    }
  }

  /**
   * Get the list of available Groq models.
   * @returns {string[]} Array of model identifiers
   */
  getAvailableModels() {
    return ['llama-3.1-8b-instant'];
  }
}

const groqService = new GroqService();
export default groqService;
