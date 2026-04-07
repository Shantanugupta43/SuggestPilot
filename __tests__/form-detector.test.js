/**
 * Tests for form-detector.js
 */

import { jest } from '@jest/globals';
import FormDetector from '../src/services/form-detector.js';
import { resetChromeMocks } from './__mocks__/chrome.js';

describe('FormDetector', () => {
  beforeEach(() => {
    resetChromeMocks();
  });

  describe('Field classification', () => {
    it('should classify job_title fields', () => {
      const result = FormDetector.analyzeField({
        name: 'job_title', type: 'text', placeholder: '',
        autocomplete: '', label: '', id: ''
      });
      expect(result.fieldType).toBe('job_title');
    });

    it('should classify company fields', () => {
      const result = FormDetector.analyzeField({
        name: 'company', type: 'text', placeholder: '',
        autocomplete: '', label: '', id: ''
      });
      expect(result.fieldType).toBe('company');
    });

    it('should classify os fields', () => {
      const result = FormDetector.analyzeField({
        name: 'operating_system', type: 'text', placeholder: '',
        autocomplete: '', label: '', id: ''
      });
      expect(result.fieldType).toBe('os');
    });

    it('should classify timezone fields by "tz"', () => {
      const result = FormDetector.analyzeField({
        name: 'tz', type: 'text', placeholder: '',
        autocomplete: '', label: '', id: ''
      });
      expect(result.fieldType).toBe('timezone');
    });

    it('should classify timezone fields by "timezone"', () => {
      const result = FormDetector.analyzeField({
        name: 'timezone', type: 'text', placeholder: '',
        autocomplete: '', label: '', id: ''
      });
      expect(result.fieldType).toBe('timezone');
    });

    it('should return null for sensitive fields (password)', () => {
      const result = FormDetector.analyzeField({
        name: 'password', type: 'password', placeholder: '',
        autocomplete: '', label: '', id: ''
      });
      expect(result).toBeNull();
    });

    it('should return null for sensitive fields (credit card)', () => {
      const result = FormDetector.analyzeField({
        name: 'credit_card', type: 'text', placeholder: '',
        autocomplete: '', label: '', id: ''
      });
      expect(result).toBeNull();
    });

    it('should return null for sensitive fields (SSN)', () => {
      const result = FormDetector.analyzeField({
        name: 'ssn', type: 'text', placeholder: '',
        autocomplete: '', label: '', id: ''
      });
      expect(result).toBeNull();
    });

    it('should classify linkedin_url fields', () => {
      const result = FormDetector.analyzeField({
        name: 'linkedin', type: 'text', placeholder: '',
        autocomplete: '', label: '', id: ''
      });
      expect(result.fieldType).toBe('linkedin_url');
    });
  });

  describe('Candidate generation', () => {
    it('should generate OS candidates from user agent', () => {
      const result = FormDetector.analyzeField({
        name: 'os', type: 'text', placeholder: '',
        autocomplete: '', label: '', id: ''
      });
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates[0].source).toBe('Your device');
    });

    it('should generate browser candidates from user agent', () => {
      const result = FormDetector.analyzeField({
        name: 'browser', type: 'text', placeholder: '',
        autocomplete: '', label: '', id: ''
      });
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates[0].source).toBe('Your device');
    });

    it('should generate timezone candidates', () => {
      const result = FormDetector.analyzeField({
        name: 'timezone', type: 'text', placeholder: '',
        autocomplete: '', label: '', id: ''
      });
      expect(result.candidates.length).toBeGreaterThan(0);
    });
  });

  describe('LinkedIn parsing', () => {
    it('should extract job title from standard LinkedIn title format', () => {
      const title = 'John Doe | Senior Engineer at Google | LinkedIn';
      const jobTitle = FormDetector._extractJobTitleFromLinkedIn(title);
      expect(jobTitle).toBe('Senior Engineer');
    });

    it('should extract job title from dash-separated LinkedIn title', () => {
      const title = 'John Doe - Senior Engineer - LinkedIn';
      const jobTitle = FormDetector._extractJobTitleFromLinkedIn(title);
      expect(jobTitle).toBe('Senior Engineer');
    });

    it('should extract company from standard LinkedIn title', () => {
      const title = 'John Doe | Senior Engineer at Google | LinkedIn';
      const company = FormDetector._extractCompanyFromLinkedIn(title);
      expect(company).toBe('Google');
    });

    it('should return null for unrecognized LinkedIn titles', () => {
      const title = 'Some random page title';
      const jobTitle = FormDetector._extractJobTitleFromLinkedIn(title);
      expect(jobTitle).toBeNull();
    });
  });
});
