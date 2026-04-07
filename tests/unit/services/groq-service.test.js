/**
 * Unit tests — GroqService
 * src/services/groq-service.js
 *
 * GroqService depends on:
 *  - global fetch (mocked in jest-setup.js)
 *  - configManager (mocked below)
 *
 * Tests cover: prompt builders, response parsing, form-fill shortcut,
 * retry on 429, and error handling.
 */

// ── Mock the configManager dependency ───────────────────────────────────────
jest.mock('../../../src/config/config-manager.js', () => ({
  __esModule: true,
  default: {
    getApiKey: jest.fn(() => 'gsk_test_api_key'),
    initialize: jest.fn(() => Promise.resolve())
  }
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeApiResponse(suggestions) {
  return {
    ok: true,
    status: 200,
    headers: { get: jest.fn(() => null) },
    json: jest.fn(() =>
      Promise.resolve({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reason: 'Based on context',
                suggestions
              })
            }
          }
        ]
      })
    )
  };
}

import groqService from '../../../src/services/groq-service.js';

describe('GroqService', () => {
  const service = groqService;

  // fetch is reset by jest-setup.js beforeEach

  // ── generateSuggestions — form-fill shortcut ───────────────────────────────

  describe('generateSuggestions() — form-fill shortcut (no API call)', () => {
    it('returns candidates directly when all have confidence >= 0.9 and type is skipAi', async () => {
      const context = {
        active_input_text: '',
        fieldMeta: {
          fieldType: 'os',
          fieldLabel: 'Operating System',
          candidates: [
            { value: 'Windows 11', source: 'Your device', confidence: 1.0 }
          ]
        }
      };

      const result = await service.generateSuggestions(context);

      expect(fetch).not.toHaveBeenCalled();
      expect(result.isFormFill).toBe(true);
      expect(result.suggestions[0].text).toBe('Windows 11');
    });

    it('also skips API for browser / linkedin_url / github_url / version type', async () => {
      for (const fieldType of ['browser', 'linkedin_url', 'github_url', 'version']) {
        const context = {
          active_input_text: '',
          fieldMeta: {
            fieldType,
            fieldLabel: fieldType,
            candidates: [{ value: 'somevalue', source: 'test', confidence: 1.0 }]
          }
        };
        const result = await service.generateSuggestions(context);
        expect(result.isFormFill).toBe(true);
      }
    });
  });

  // ── generateSuggestions — normal AI path ──────────────────────────────────

  describe('generateSuggestions() — AI path', () => {
    it('calls the Groq API and returns parsed suggestions', async () => {
      global.fetch.mockResolvedValueOnce(
        makeApiResponse([
          { text: 'How to use React hooks effectively', derivation: 'session' },
          { text: 'React hooks best practices 2024', derivation: 'context' }
        ])
      );

      const context = {
        active_input_text: 'react hooks',
        active_tabs: [],
        recent_history: []
      };

      const result = await service.generateSuggestions(context);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions[0].text).toContain('React hooks');
      // The API path must NOT set isFormFill — if it did, the form-fill shortcut
      // would be indistinguishable from a normal AI response
      expect(result.isFormFill).toBeFalsy();
    });

    it('marks form-fill results with isFormFill: true', async () => {
      global.fetch.mockResolvedValueOnce(
        makeApiResponse([
          { text: 'Software Engineer', derivation: 'tabs' }
        ])
      );

      const context = {
        active_input_text: '',
        fieldMeta: {
          fieldType: 'job_title',
          fieldLabel: 'Job Title',
          candidates: []
        }
      };

      const result = await service.generateSuggestions(context);
      expect(result.isFormFill).toBe(true);
    });

    it('returns error object when API call throws', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network failure'));

      const result = await service.generateSuggestions({
        active_input_text: 'test query',
        active_tabs: []
      });

      expect(result.suggestions).toEqual([]);
      expect(result.error).toBe('Network failure');
    });
  });

  // ── callWithRetry ──────────────────────────────────────────────────────────

  describe('callWithRetry()', () => {
    it('retries once on a 429 response', async () => {
      // First call: 429 rate limit with retry-after: 0 to skip the wait timer
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: { get: jest.fn(() => '0') }, // retry-after: 0 s
          json: jest.fn(() => Promise.resolve({ error: { message: 'rate limited' } }))
        })
        // Second call: success
        .mockResolvedValueOnce(
          makeApiResponse([{ text: 'Retry succeeded', derivation: 'session' }])
        );

      const result = await service.callWithRetry('gsk_key', 'prompt', 'sysprompt');

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result.suggestions[0].text).toBe('Retry succeeded');
    });

    it('throws on non-429 API error', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: jest.fn(() => null) },
        json: jest.fn(() => Promise.resolve({ error: { message: 'Unauthorized' } }))
      });

      await expect(
        service.callWithRetry('gsk_key', 'prompt', 'sysprompt')
      ).rejects.toThrow('Unauthorized');
    });

    it('throws when the response has no content', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: jest.fn(() => null) },
        json: jest.fn(() => Promise.resolve({ choices: [] }))
      });

      await expect(
        service.callWithRetry('gsk_key', 'prompt', 'sysprompt')
      ).rejects.toThrow('No response content from Groq');
    });
  });

  // ── buildContextAwarePrompt ────────────────────────────────────────────────

  describe('buildContextAwarePrompt()', () => {
    it('always includes the user input', () => {
      const prompt = service.buildContextAwarePrompt({ active_input_text: 'typescript' });
      expect(prompt).toContain('typescript');
    });

    it('includes SESSION and THREAD lines when sessionIntent is present', () => {
      const prompt = service.buildContextAwarePrompt({
        active_input_text: 'ts',
        sessionIntent: {
          sessionSummary: 'Researching: typescript',
          recentThread: 'typescript generics'
        }
      });
      expect(prompt).toContain('SESSION:');
      expect(prompt).toContain('THREAD:');
    });

    it('includes TABS when active_tabs is provided', () => {
      const prompt = service.buildContextAwarePrompt({
        active_input_text: 'ts',
        active_tabs: [{ title: 'TypeScript Docs', url: 'https://typescriptlang.org' }]
      });
      expect(prompt).toContain('TABS:');
    });

    it('includes HIST when recent_history is provided', () => {
      const prompt = service.buildContextAwarePrompt({
        active_input_text: 'ts',
        recent_history: [{ title: 'TypeScript Advanced', url: 'https://example.com' }]
      });
      expect(prompt).toContain('HIST:');
    });
  });

  // ── buildFormFieldPrompt ───────────────────────────────────────────────────

  describe('buildFormFieldPrompt()', () => {
    it('includes FIELD_TYPE and FIELD_LABEL', () => {
      const prompt = service.buildFormFieldPrompt({
        active_input_text: 'Engineer',
        fieldMeta: { fieldType: 'job_title', fieldLabel: 'Current Role', candidates: [] }
      });
      expect(prompt).toContain('FIELD_TYPE:job_title');
      expect(prompt).toContain('FIELD_LABEL:"Current Role"');
    });

    it('includes KNOWN_VALUES when candidates are present', () => {
      const prompt = service.buildFormFieldPrompt({
        active_input_text: '',
        fieldMeta: {
          fieldType: 'company',
          fieldLabel: 'Company',
          candidates: [{ value: 'Acme Corp', source: 'LinkedIn tab' }]
        }
      });
      expect(prompt).toContain('KNOWN_VALUES:');
      expect(prompt).toContain('Acme Corp');
    });
  });

  // ── parseResponse ──────────────────────────────────────────────────────────

  describe('parseResponse()', () => {
    it('parses clean JSON', () => {
      const raw = JSON.stringify({
        reason: 'test',
        suggestions: [
          { text: 'Answer A', derivation: 'context' },
          { text: 'Answer B', derivation: 'tabs' }
        ]
      });
      const result = service.parseResponse(raw);
      expect(result.suggestions).toHaveLength(2);
      expect(result.reason).toBe('test');
    });

    it('strips markdown code fences before parsing', () => {
      const raw = '```json\n{"reason":"ok","suggestions":[{"text":"Test answer","derivation":"ctx"}]}\n```';
      const result = service.parseResponse(raw);
      expect(result.suggestions[0].text).toBe('Test answer');
    });

    it('extracts JSON embedded in surrounding text', () => {
      const raw = 'Here is the response: {"reason":"ok","suggestions":[{"text":"Embedded","derivation":"ctx"}]} done.';
      const result = service.parseResponse(raw);
      expect(result.suggestions[0].text).toBe('Embedded');
    });

    it('returns empty suggestions for malformed content', () => {
      // parseResponse calls console.error intentionally — suppress it to keep CI output clean
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const result = service.parseResponse('this is not json at all');
      expect(result.suggestions).toEqual([]);
      consoleSpy.mockRestore();
    });

    it('filters out suggestions shorter than 3 chars', () => {
      const raw = JSON.stringify({
        reason: 'test',
        suggestions: [
          { text: 'ab', derivation: 'ctx' },      // too short
          { text: 'Valid answer', derivation: 'ctx' }
        ]
      });
      const result = service.parseResponse(raw);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].text).toBe('Valid answer');
    });

    it('limits output to 3 suggestions', () => {
      const raw = JSON.stringify({
        reason: 'test',
        suggestions: [
          { text: 'Suggestion one', derivation: 'ctx' },
          { text: 'Suggestion two', derivation: 'ctx' },
          { text: 'Suggestion three', derivation: 'ctx' },
          { text: 'Suggestion four', derivation: 'ctx' }
        ]
      });
      const result = service.parseResponse(raw);
      expect(result.suggestions.length).toBeLessThanOrEqual(3);
    });
  });

  // ── validateSuggestions ────────────────────────────────────────────────────

  describe('validateSuggestions()', () => {
    it('accepts string items and wraps them', () => {
      const result = service.validateSuggestions(['Answer one', 'Answer two']);
      expect(result[0]).toMatchObject({ text: 'Answer one', derivation: 'Based on context' });
    });

    it('accepts object items', () => {
      const result = service.validateSuggestions([{ text: 'Hello world', derivation: 'tab' }]);
      expect(result[0].text).toBe('Hello world');
    });

    it('returns empty array for non-array input', () => {
      expect(service.validateSuggestions(null)).toEqual([]);
      expect(service.validateSuggestions('string')).toEqual([]);
    });

    it('rejects items with text longer than 200 chars', () => {
      const long = 'a'.repeat(201);
      const result = service.validateSuggestions([{ text: long, derivation: 'ctx' }]);
      expect(result).toHaveLength(0);
    });

    it('rejects items containing "reason:" or "suggestions:"', () => {
      const result = service.validateSuggestions([
        { text: 'reason: this is not a suggestion', derivation: 'ctx' }
      ]);
      expect(result).toHaveLength(0);
    });
  });
});
