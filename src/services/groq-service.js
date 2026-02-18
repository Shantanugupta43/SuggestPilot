/**
 * Enhanced Groq API Service
 * + Session Intent Tracking in prompt
 * + Smart Form-Fill mode
 */

import configManager from '../config/config-manager.js';

class GroqService {
  constructor() {
    this.baseURL = 'https://api.groq.com/openai/v1';
    this.model = 'llama-3.1-8b-instant';
  }

  async generateSuggestions(context) {
    try {
      const apiKey = configManager.getApiKey();

      // ── Form-fill mode: structured candidates, no AI needed ────────────────
      if (context.fieldMeta?.isFormFill && context.fieldMeta.candidates?.length > 0) {
        return this._buildFormFillResponse(context.fieldMeta);
      }

      // ── Form field detected but no local candidates → ask AI ───────────────
      const prompt = context.fieldMeta?.fieldType
        ? this.buildFormFieldPrompt(context)
        : this.buildContextAwarePrompt(context);

      const systemPrompt = context.fieldMeta?.fieldType
        ? this.getFormFillSystemPrompt()
        : this.getContextAwareSystemPrompt();

      console.log('Generating for:', context.active_input_text);
      console.log('Session intent:', context.sessionIntent?.sessionSummary || 'none');
      console.log('Form field:', context.fieldMeta?.fieldType || 'none');

      return await this.callWithRetry(apiKey, prompt, systemPrompt);
    } catch (error) {
      console.error('Groq API error:', error);
      return { reason: 'Error generating suggestions', suggestions: [], error: error.message };
    }
  }

  /**
   * Build a form-fill response directly from local candidates (no API call needed)
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

  async callWithRetry(apiKey, prompt, systemPrompt, attempt = 0) {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 200,
        top_p: 0.9
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
   * Standard context-aware prompt — now includes session intent thread.
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
      const thread = context.sessionIntent.recentThread.slice(0, 120);
      parts.push(`THREAD:${thread}`);
    }

    // Other tabs — 2 max
    if (context.active_tabs?.length > 0) {
      const tabs = context.active_tabs
        .slice(0, 2)
        .map(t => `"${t.title.slice(0, 40)}"`)
        .join(', ');
      parts.push(`TABS:${tabs}`);
    }

    // Recent history — 2 max
    if (context.recent_history?.length > 0) {
      const hist = context.recent_history
        .slice(0, 2)
        .map(t => `"${t.title.slice(0, 40)}"`)
        .join(', ');
      parts.push(`HIST:${hist}`);
    }

    return parts.join('\n');
  }

  /**
   * Form-field prompt — asks AI for field-specific suggestions.
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

    // Include tabs/session for professional fields
    if (context.sessionIntent?.sessionSummary) {
      parts.push(`SESSION:${context.sessionIntent.sessionSummary}`);
    }
    if (context.active_tabs?.length > 0) {
      const tabs = context.active_tabs
        .slice(0, 2)
        .map(t => `"${t.title.slice(0, 40)}"`)
        .join(', ');
      parts.push(`TABS:${tabs}`);
    }

    return parts.join('\n');
  }

  // ─── System prompts ────────────────────────────────────────────────────────

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

  // ─── Response parsing (unchanged from original) ────────────────────────────

  parseResponse(content) {
    let cleaned = content.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '');
    cleaned = cleaned.replace(/```\s*$/, '');
    cleaned = cleaned.trim();

    try {
      const parsed = JSON.parse(cleaned);
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
    } catch (parseError) {
      console.log('Direct JSON parse failed:', parseError.message);
    }

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
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
      } catch (e) {
        console.log('JSON extraction failed:', e.message);
      }
    }

    console.error('AI did not return proper JSON format');
    return {
      reason: 'Could not parse AI response',
      suggestions: []
    };
  }

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
        if (text.length < 3 || text.length > 200) return false;
        if (/^[{}\[\]"'`]+$/.test(text)) return false;
        if (text.toLowerCase().includes('reason:')) return false;
        if (text.toLowerCase().includes('suggestions:')) return false;
        return true;
      })
      .slice(0, 3);
  }

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
          model: this.model,
          messages: [
            { role: 'system', content: 'Respond with only: {"status": "ok"}' },
            { role: 'user', content: 'test' }
          ],
          max_tokens: 20,
          temperature: 0
        })
      });
      return response.ok;
    } catch (error) {
      console.error('API connection test failed:', error);
      return false;
    }
  }

  getAvailableModels() {
    return ['llama-3.1-8b-instant'];
  }
}

const groqService = new GroqService();
export default groqService;