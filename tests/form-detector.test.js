import { jest } from '@jest/globals';
import formDetector from '../src/services/form-detector.js';

describe('form-detector', () => {
  const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  function setUserAgent(userAgent) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent },
      configurable: true,
      writable: true
    });
  }

  afterEach(() => {
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
    } else {
      delete globalThis.navigator;
    }
  });

  describe('analyzeField', () => {
    test('returns null for sensitive fields', () => {
      const result = formDetector.analyzeField({
        name: 'password',
        id: 'user-password',
        placeholder: 'Password',
        autocomplete: 'current-password',
        label: 'Password',
        type: 'password'
      });

      expect(result).toBeNull();
    });

    test('detects OS field and creates deterministic candidate', () => {
      const osSpy = jest.spyOn(formDetector, '_detectOS').mockReturnValue('Windows 11');

      const result = formDetector.analyzeField({
        name: 'operating_system',
        id: 'os',
        placeholder: 'Your OS',
        autocomplete: '',
        label: 'Operating System',
        type: 'text'
      });

      expect(result).not.toBeNull();
      expect(result.fieldType).toBe('os');
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates[0]).toEqual(
        expect.objectContaining({
          value: 'Windows 11',
          source: 'Your device',
          confidence: 1
        })
      );

      osSpy.mockRestore();
    });

    test('extracts linkedin profile url from open tabs', () => {
      const tabs = [
        { title: 'Profile | LinkedIn', url: 'https://www.linkedin.com/in/jane-doe/' }
      ];

      const result = formDetector.analyzeField(
        {
          name: 'linkedin',
          id: 'linkedin-url',
          placeholder: 'LinkedIn URL',
          autocomplete: '',
          label: 'LinkedIn',
          type: 'url'
        },
        tabs
      );

      expect(result.fieldType).toBe('linkedin_url');
      expect(result.candidates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: 'https://www.linkedin.com/in/jane-doe/'
          })
        ])
      );
    });

    test('uses preClassifiedType when supplied and skips classifier', () => {
      const classifySpy = jest.spyOn(formDetector, '_classifyField');

      const result = formDetector.analyzeField(
        {
          name: 'any_name',
          id: 'any_id',
          placeholder: 'Unknown',
          autocomplete: '',
          label: 'Unknown',
          type: 'text'
        },
        [],
        'issue_subject'
      );

      expect(result.fieldType).toBe('issue_subject');
      expect(classifySpy).not.toHaveBeenCalled();

      classifySpy.mockRestore();
    });

    test('returns object with isFormFill false when no candidates found', () => {
      const result = formDetector.analyzeField({
        name: 'job_title',
        id: 'position',
        placeholder: 'Role',
        autocomplete: '',
        label: '',
        type: 'text'
      }, []);

      expect(result).toEqual(
        expect.objectContaining({
          fieldType: 'job_title',
          isFormFill: false,
          candidates: []
        })
      );
    });

    test('uses fallback label when explicit label is missing', () => {
      const result = formDetector.analyzeField(
        {
          name: '',
          id: 'ticket-subject',
          placeholder: '',
          autocomplete: '',
          label: '',
          type: 'text',
          pageTitle: 'Crash on Login - Dashboard'
        },
        [],
        'issue_subject'
      );

      expect(result.fieldLabel).toBe('ticket-subject');
    });
  });

  describe('_classifyField', () => {
    test('classifies sensitive email fields as sensitive', () => {
      const type = formDetector._classifyField({
        name: 'work_email',
        id: 'email',
        placeholder: 'Email',
        autocomplete: 'email',
        label: 'Email address',
        type: 'text'
      });

      expect(type).toBe('sensitive');
    });

    test('classifies first name fields', () => {
      const type = formDetector._classifyField({
        name: 'fname',
        id: '',
        placeholder: '',
        autocomplete: '',
        label: 'First Name',
        type: 'text'
      });

      expect(type).toBe('first_name');
    });

    test('classifies company fields', () => {
      const type = formDetector._classifyField({
        name: 'current_employer',
        id: '',
        placeholder: '',
        autocomplete: 'organization',
        label: 'Company',
        type: 'text'
      });

      expect(type).toBe('company');
    });

    test('classifies issue_description fields', () => {
      const type = formDetector._classifyField({
        name: 'details',
        id: 'description',
        placeholder: 'Explain what happened',
        autocomplete: '',
        label: 'Issue Details',
        type: 'textarea'
      });

      expect(type).toBe('issue_description');
    });

    test('classifies search fields by input type', () => {
      const type = formDetector._classifyField({
        name: 'anything',
        id: 'searchBox',
        placeholder: 'Search',
        autocomplete: '',
        label: '',
        type: 'search'
      });

      expect(type).toBe('search');
    });

    test('returns null for unrecognized fields', () => {
      const type = formDetector._classifyField({
        name: 'custom_field_x1',
        id: 'weird-id',
        placeholder: 'Something',
        autocomplete: '',
        label: 'Random label',
        type: 'text'
      });

      expect(type).toBeNull();
    });
  });

  describe('_buildCandidates', () => {
    test('builds job title candidate from LinkedIn title', () => {
      const candidates = formDetector._buildCandidates(
        'job_title',
        {},
        [{ title: 'Jane Doe | Senior Engineer at Acme | LinkedIn', url: 'https://linkedin.com/in/jane' }]
      );

      expect(candidates).toEqual([
        { value: 'Senior Engineer', source: 'LinkedIn tab', confidence: 0.85 }
      ]);
    });

    test('builds company candidate from LinkedIn title', () => {
      const candidates = formDetector._buildCandidates(
        'company',
        {},
        [{ title: 'Jane Doe | Senior Engineer at Acme Corp | LinkedIn', url: 'https://linkedin.com/in/jane' }]
      );

      expect(candidates).toEqual([
        { value: 'Acme Corp', source: 'LinkedIn tab', confidence: 0.8 }
      ]);
    });

    test('builds OS candidate using _detectOS helper', () => {
      const osSpy = jest.spyOn(formDetector, '_detectOS').mockReturnValue('macOS 14.5');

      const candidates = formDetector._buildCandidates('os', {}, []);

      expect(candidates).toEqual([
        { value: 'macOS 14.5', source: 'Your device', confidence: 1 }
      ]);

      osSpy.mockRestore();
    });

    test('builds browser candidate using _detectBrowser helper', () => {
      const browserSpy = jest.spyOn(formDetector, '_detectBrowser').mockReturnValue('Chrome 121');

      const candidates = formDetector._buildCandidates('browser', {}, []);

      expect(candidates).toEqual([
        { value: 'Chrome 121', source: 'Your device', confidence: 1 }
      ]);

      browserSpy.mockRestore();
    });

    test('builds linkedin_url candidate from profile URL tabs only', () => {
      const candidates = formDetector._buildCandidates(
        'linkedin_url',
        {},
        [
          { title: 'LinkedIn Feed', url: 'https://www.linkedin.com/feed/' },
          { title: 'Profile', url: 'https://www.linkedin.com/in/jane-doe/' }
        ]
      );

      expect(candidates).toEqual([
        {
          value: 'https://www.linkedin.com/in/jane-doe/',
          source: 'LinkedIn tab',
          confidence: 0.95
        }
      ]);
    });

    test('builds github_url candidate from top-level profile URL', () => {
      const candidates = formDetector._buildCandidates(
        'github_url',
        {},
        [
          { title: 'Repo', url: 'https://github.com/org/repo' },
          { title: 'Profile', url: 'https://github.com/janedoe' }
        ]
      );

      expect(candidates).toEqual([
        {
          value: 'https://github.com/janedoe',
          source: 'GitHub tab',
          confidence: 0.95
        }
      ]);
    });

    test('builds website candidate from portfolio tab', () => {
      const candidates = formDetector._buildCandidates(
        'website',
        {},
        [
          { title: 'Google Search', url: 'https://google.com/search?q=test' },
          { title: 'Jane Portfolio', url: 'https://janedoe.dev' }
        ]
      );

      expect(candidates).toEqual([
        {
          value: 'https://janedoe.dev',
          source: 'Portfolio tab',
          confidence: 0.75
        }
      ]);
    });

    test('builds issue_subject using cleaned page title', () => {
      const candidates = formDetector._buildCandidates(
        'issue_subject',
        { pageTitle: 'Checkout not working - My App' },
        []
      );

      expect(candidates).toEqual([
        {
          value: 'Issue with Checkout not working',
          source: 'Current page',
          confidence: 0.6
        }
      ]);
    });

    test('builds issue_description using OS and browser context', () => {
      const osSpy = jest.spyOn(formDetector, '_detectOS').mockReturnValue('Windows 11');
      const browserSpy = jest.spyOn(formDetector, '_detectBrowser').mockReturnValue('Firefox 124');

      const candidates = formDetector._buildCandidates('issue_description', {}, []);

      expect(candidates).toEqual([
        {
          value: 'Environment: Windows 11 / Firefox 124',
          source: 'Your device',
          confidence: 0.9
        }
      ]);

      osSpy.mockRestore();
      browserSpy.mockRestore();
    });

    test('returns empty array for unsupported field type', () => {
      const candidates = formDetector._buildCandidates('first_name', {}, []);
      expect(candidates).toEqual([]);
    });
  });

  describe('extraction helpers', () => {
    test('_extractJobTitleFromLinkedIn parses "| role at company |" format', () => {
      const job = formDetector._extractJobTitleFromLinkedIn('Jane Doe | Staff Engineer at Acme | LinkedIn');
      expect(job).toBe('Staff Engineer');
    });

    test('_extractJobTitleFromLinkedIn parses "- role - LinkedIn" format', () => {
      const job = formDetector._extractJobTitleFromLinkedIn('Jane Doe - Engineering Manager - LinkedIn');
      expect(job).toBe('Engineering Manager');
    });

    test('_extractCompanyFromLinkedIn extracts company name after "at"', () => {
      const company = formDetector._extractCompanyFromLinkedIn('Jane Doe | Engineer at Example Labs | LinkedIn');
      expect(company).toBe('Example Labs');
    });

    test('_extractSkillsFromGitHub currently returns null', () => {
      expect(formDetector._extractSkillsFromGitHub('janedoe (Jane Doe) · GitHub')).toBeNull();
    });
  });

  describe('device detection helpers', () => {
    test('_detectOS identifies macOS with version', () => {
      setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36');
      expect(formDetector._detectOS()).toBe('macOS 14.5');
    });

    test('_detectOS identifies Android with version', () => {
      setUserAgent('Mozilla/5.0 (Android 14; Pixel 8) AppleWebKit/537.36');
      expect(formDetector._detectOS()).toBe('Android 14');
    });

    test('_detectBrowser identifies Edge over Chrome when both appear in UA', () => {
      setUserAgent(
        'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0'
      );
      expect(formDetector._detectBrowser()).toBe('Microsoft Edge 123');
    });

    test('_detectBrowser identifies Firefox', () => {
      setUserAgent('Mozilla/5.0 Gecko/20100101 Firefox/124.0');
      expect(formDetector._detectBrowser()).toBe('Firefox 124');
    });
  });
});
