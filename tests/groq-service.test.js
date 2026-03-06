import { jest } from '@jest/globals';
import groqService from '../src/services/groq-service.js';
import configManager from '../src/config/config-manager.js';

describe('groq-service', () => {
  test('returns direct form-fill response for high-confidence local candidates', async () => {
    const apiSpy = jest.spyOn(configManager, 'getApiKey').mockReturnValue('gsk_test_key');

    const result = await groqService.generateSuggestions({
      fieldMeta: {
        fieldType: 'os',
        fieldLabel: 'Operating System',
        candidates: [{ value: 'Windows 11', source: 'Your device', confidence: 1.0 }]
      }
    });

    expect(result.isFormFill).toBe(true);
    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: 'Windows 11'
        })
      ])
    );

    apiSpy.mockRestore();
  });

  test('calls Groq API and parses valid JSON response', async () => {
    const apiSpy = jest.spyOn(configManager, 'getApiKey').mockReturnValue('gsk_test_key');
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                reason: 'Based on session context',
                suggestions: [
                  { text: 'How to optimize asyncio event loop performance in Python?', derivation: 'session' },
                  { text: 'Asyncio vs threading performance benchmark guide', derivation: 'tabs' }
                ]
              })
            }
          }
        ]
      }),
      headers: { get: () => null }
    });

    const result = await groqService.generateSuggestions({
      active_input_text: 'python asyncio',
      sessionIntent: { sessionSummary: 'Researching: python, asyncio' }
    });

    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.reason).toBe('Based on session context');

    apiSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  test('parseResponse extracts JSON wrapped in code fences', () => {
    const raw = '```json\n{"reason":"ok","suggestions":[{"text":"suggestion one","derivation":"context"}]}\n```';
    const result = groqService.parseResponse(raw);

    expect(result.reason).toBe('ok');
    expect(result.suggestions[0].text).toBe('suggestion one');
  });

  test('parseResponse returns empty suggestions on invalid payload', () => {
    const result = groqService.parseResponse('not json at all');
    expect(result.suggestions).toEqual([]);
  });
});
