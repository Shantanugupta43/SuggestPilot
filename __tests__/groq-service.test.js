/**
 * Tests for groq-service.js — JSON parsing and suggestion validation
 */

import { jest } from '@jest/globals';
import GroqService from '../src/services/groq-service.js';
import { resetChromeMocks } from './__mocks__/chrome.js';

describe('GroqService', () => {
  beforeEach(() => {
    resetChromeMocks();
  });

  describe('parseResponse', () => {
    it('should parse valid JSON response', () => {
      const content = JSON.stringify({
        reason: 'Test reason',
        suggestions: [
          { text: 'Suggestion one', derivation: 'From context' },
          { text: 'Suggestion two', derivation: 'From tabs' },
          { text: 'Suggestion three', derivation: 'Creative' }
        ]
      });
      const result = GroqService.parseResponse(content);
      expect(result.reason).toBe('Test reason');
      expect(result.suggestions).toHaveLength(3);
      expect(result.suggestions[0].text).toBe('Suggestion one');
    });

    it('should parse JSON wrapped in markdown code blocks', () => {
      const content = '```json\n{"reason":"test","suggestions":[{"text":"hello world","derivation":"ctx"}]}\n```';
      const result = GroqService.parseResponse(content);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].text).toBe('hello world');
    });

    it('should extract JSON from mixed text', () => {
      const content = 'Here is the result: {"reason":"ok","suggestions":[{"text":"test suggestion","derivation":"x"}]} done.';
      const result = GroqService.parseResponse(content);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].text).toBe('test suggestion');
    });

    it('should return empty suggestions for invalid JSON', () => {
      const result = GroqService.parseResponse('not json at all');
      expect(result.suggestions).toEqual([]);
    });

    it('should return empty suggestions for JSON without suggestions array', () => {
      const content = JSON.stringify({ reason: 'ok' });
      const result = GroqService.parseResponse(content);
      expect(result.suggestions).toEqual([]);
    });
  });

  describe('validateSuggestions', () => {
    it('should normalize string suggestions', () => {
      const result = GroqService.validateSuggestions(['one', 'two']);
      expect(result).toEqual([
        { text: 'one', derivation: 'Based on context' },
        { text: 'two', derivation: 'Based on context' }
      ]);
    });

    it('should normalize object suggestions', () => {
      const input = [
        { text: 'hello', derivation: 'test' },
        { suggestion: 'world', reason: 'from tabs' }
      ];
      const result = GroqService.validateSuggestions(input);
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('hello');
      expect(result[1].text).toBe('world');
    });

    it('should filter out suggestions that are too short', () => {
      const input = ['ab', 'hello world', 'cd'];
      const result = GroqService.validateSuggestions(input);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('hello world');
    });

    it('should filter out suggestions that are too long', () => {
      const long = 'a'.repeat(201);
      const input = [long, 'valid suggestion'];
      const result = GroqService.validateSuggestions(input);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('valid suggestion');
    });

    it('should filter out JSON-only text', () => {
      const input = ['{}', '[]', 'valid text here'];
      const result = GroqService.validateSuggestions(input);
      expect(result).toHaveLength(1);
    });

    it('should filter out suggestions containing "reason:"', () => {
      const input = ['reason: something', 'normal suggestion'];
      const result = GroqService.validateSuggestions(input);
      expect(result).toHaveLength(1);
    });

    it('should limit to max 3 suggestions', () => {
      const input = ['one', 'two', 'three', 'four', 'five'];
      const result = GroqService.validateSuggestions(input);
      expect(result).toHaveLength(3);
    });
  });

  describe('validateSuggestionOrdering', () => {
    it('should prefix derivation with Session/Context/Smart labels', () => {
      const input = [
        { text: 'a', derivation: 'from thread' },
        { text: 'b', derivation: 'from tabs' },
        { text: 'c', derivation: 'creative' }
      ];
      const result = GroqService.validateSuggestionOrdering(input);
      expect(result[0].derivation).toContain('Session:');
      expect(result[1].derivation).toContain('Context:');
      expect(result[2].derivation).toContain('Smart:');
    });
  });
});
