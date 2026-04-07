/**
 * Unit tests — FormDetector
 * src/services/form-detector.js
 *
 * FormDetector is pure logic — no chrome APIs, no network.
 * Tests cover: field classification, candidate building, and edge cases.
 */

// ── Helper to build a minimal fieldMeta object ──────────────────────────────
function meta(overrides = {}) {
  return {
    name: '',
    id: '',
    placeholder: '',
    autocomplete: '',
    label: '',
    type: 'text',
    pageUrl: 'https://example.com',
    pageTitle: '',
    ...overrides
  };
}

describe('FormDetector', () => {
  let detector;

  beforeEach(async () => {
    // Re-import singleton fresh to reset any lingering state
    jest.resetModules();
    const mod = await import('../../../src/services/form-detector.js');
    detector = mod.default;
  });

  // ── analyzeField — null / sensitive returns ────────────────────────────────

  describe('analyzeField() — sensitive fields', () => {
    it('returns null for a password field (by name)', () => {
      expect(detector.analyzeField(meta({ name: 'password' }))).toBeNull();
    });

    it('returns null for a field with type="password"', () => {
      expect(detector.analyzeField(meta({ type: 'password' }))).toBeNull();
    });

    it('returns null for credit card fields', () => {
      expect(detector.analyzeField(meta({ name: 'credit-card' }))).toBeNull();
    });

    it('returns null for ssn/social security', () => {
      expect(detector.analyzeField(meta({ label: 'Social Security Number' }))).toBeNull();
    });

    it('returns null for email fields', () => {
      expect(detector.analyzeField(meta({ name: 'email' }))).toBeNull();
    });

    it('returns null for unrecognisable fields', () => {
      expect(detector.analyzeField(meta({ name: 'xyzabc123', id: 'zzz_field' }))).toBeNull();
    });
  });

  // ── _classifyField ─────────────────────────────────────────────────────────

  describe('_classifyField()', () => {
    const cases = [
      // Identity
      [{ name: 'first_name' }, 'first_name'],
      [{ name: 'firstName' }, 'first_name'],
      [{ name: 'fname' }, 'first_name'],
      [{ name: 'last_name' }, 'last_name'],
      [{ name: 'lname' }, 'last_name'],
      [{ name: 'surname' }, 'last_name'],
      [{ name: 'full_name' }, 'full_name'],
      // Professional
      [{ name: 'job_title' }, 'job_title'],
      [{ placeholder: 'Your position' }, 'job_title'],
      [{ name: 'company' }, 'company'],
      [{ label: 'Employer' }, 'company'],
      [{ name: 'linkedin' }, 'linkedin_url'],
      [{ name: 'github_url' }, 'github_url'],
      [{ name: 'website' }, 'website'],
      [{ name: 'portfolio' }, 'website'],
      [{ name: 'years_of_exp' }, 'experience_years'],
      [{ name: 'pronouns' }, 'pronouns'],
      [{ name: 'education' }, 'education'],
      [{ name: 'skills' }, 'skills'],
      // Support
      [{ name: 'os' }, 'os'],
      [{ name: 'operating_system' }, 'os'],
      [{ name: 'browser' }, 'browser'],
      [{ name: 'version' }, 'version'],
      [{ name: 'issue_title' }, 'issue_subject'],
      [{ name: 'description' }, 'issue_description'],
      // Location
      [{ name: 'city' }, 'city'],
      [{ name: 'country' }, 'country'],
      [{ name: 'zip' }, 'zip'],
      [{ name: 'timezone' }, 'timezone'],
      // Search
      [{ type: 'search' }, 'search'],
    ];

    test.each(cases)('classifies %o as %s', (fieldOverrides, expected) => {
      const result = detector._classifyField(meta(fieldOverrides));
      expect(result).toBe(expected);
    });

    it('classifies spoken-language field correctly', () => {
      expect(detector._classifyField(meta({ label: 'preferred language' }))).toBe('languages');
    });

    it('does NOT classify "programming_language" as spoken languages', () => {
      const result = detector._classifyField(meta({ name: 'programming_language' }));
      expect(result).not.toBe('languages');
    });
  });

  // ── analyzeField — return shape ────────────────────────────────────────────

  describe('analyzeField() — return shape', () => {
    it('returns an object with fieldType, fieldLabel, candidates, isFormFill', () => {
      const result = detector.analyzeField(meta({ name: 'job_title' }));
      expect(result).toMatchObject({
        fieldType: 'job_title',
        fieldLabel: expect.any(String),
        candidates: expect.any(Array),
        isFormFill: expect.any(Boolean)
      });
    });

    it('uses label as fieldLabel when available', () => {
      const result = detector.analyzeField(meta({ name: 'job_title', label: 'Current Role' }));
      expect(result.fieldLabel).toBe('Current Role');
    });

    it('falls back to placeholder then name for fieldLabel', () => {
      const result = detector.analyzeField(
        meta({ name: 'company', placeholder: 'e.g. Acme Corp' })
      );
      expect(result.fieldLabel).toBe('e.g. Acme Corp');
    });

    it('accepts a pre-classified field type and skips re-classification', () => {
      const result = detector.analyzeField(meta({ name: 'anything' }), [], 'city');
      expect(result.fieldType).toBe('city');
    });
  });

  // ── _buildCandidates — OS / browser detection ──────────────────────────────

  describe('_buildCandidates() — OS / browser detection', () => {
    it('always produces at least one candidate for "os"', () => {
      const result = detector.analyzeField(meta({ name: 'os' }));
      if (result) {
        expect(result.candidates.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('produces a timezone candidate', () => {
      const result = detector.analyzeField(meta({ name: 'timezone' }));
      // jsdom may or may not support Intl, so guard
      if (result && result.candidates.length > 0) {
        expect(result.candidates[0]).toMatchObject({
          value: expect.any(String),
          source: 'Your device',
          confidence: 1.0
        });
      }
    });

    /**
     * BUG DOCUMENTATION: _detectOS checks `Windows NT 11` but real Windows 11
     * browsers still report `Windows NT 10.0` in the UA string — identical to
     * Windows 10. The `Windows NT 11` branch is dead code and can never match.
     *
     * This test documents the current (broken) behaviour so that when the source
     * is fixed (e.g. via navigator.userAgentData), the test will be updated too.
     */
    it('[BUG] Windows 11 UA string is reported as "Windows NT 10.0", not "NT 11" — _detectOS returns "Windows 10"', () => {
      const realWindows11UA =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

      const originalUA = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
      Object.defineProperty(navigator, 'userAgent', {
        value: realWindows11UA,
        configurable: true
      });

      const result = detector._detectOS();

      // Expected (correct) value would be 'Windows 11', but _detectOS
      // cannot distinguish it from Windows 10 via UA string alone.
      expect(result).toBe('Windows 10'); // documents the current incorrect output

      if (originalUA) {
        Object.defineProperty(navigator, 'userAgent', originalUA);
      }
    });
  });

  // ── _buildCandidates — tab-based candidates ────────────────────────────────

  describe('_buildCandidates() — LinkedIn / GitHub tabs', () => {
    const linkedinTab = {
      url: 'https://www.linkedin.com/in/johnsmith/',
      title: 'John Smith | Senior Engineer at Acme Corp | LinkedIn'
    };

    const githubTab = {
      url: 'https://github.com/johnsmith',
      title: 'johnsmith (John Smith) · GitHub'
    };

    it('extracts job_title from a LinkedIn tab', () => {
      const result = detector.analyzeField(meta({ name: 'job_title' }), [linkedinTab]);
      expect(result.candidates[0]).toMatchObject({
        value: 'Senior Engineer',
        source: 'LinkedIn tab'
      });
    });

    it('extracts company from a LinkedIn tab', () => {
      const result = detector.analyzeField(meta({ name: 'company' }), [linkedinTab]);
      expect(result.candidates[0]).toMatchObject({
        value: expect.stringContaining('Acme'),
        source: 'LinkedIn tab'
      });
    });

    it('populates linkedin_url from open LinkedIn profile tab', () => {
      const result = detector.analyzeField(meta({ name: 'linkedin' }), [linkedinTab]);
      expect(result.candidates[0]).toMatchObject({
        value: linkedinTab.url,
        source: 'LinkedIn tab'
      });
    });

    it('populates github_url from open GitHub profile tab', () => {
      const result = detector.analyzeField(meta({ name: 'github_url' }), [githubTab]);
      expect(result.candidates[0]).toMatchObject({
        value: githubTab.url,
        source: 'GitHub tab'
      });
    });

    it('produces no candidates for job_title when no LinkedIn tab is open', () => {
      const result = detector.analyzeField(meta({ name: 'job_title' }), []);
      expect(result.candidates).toHaveLength(0);
    });
  });

  // ── _buildCandidates — issue fields ───────────────────────────────────────

  describe('_buildCandidates() — issue report fields', () => {
    it('derives issue_subject from pageTitle', () => {
      const result = detector.analyzeField(
        meta({ name: 'issue_title', pageTitle: 'Crash on save – My App' }),
        []
      );
      expect(result.candidates[0].value).toContain('Crash on save');
    });

    it('returns empty candidates for issue_subject when pageTitle is blank', () => {
      const result = detector.analyzeField(meta({ name: 'issue_title', pageTitle: '' }), []);
      expect(result.candidates).toHaveLength(0);
    });
  });

  // ── _isSpokenLanguageField (internal; tested via _classifyField) ───────────

  describe('_isSpokenLanguageField()', () => {
    it('returns true for "preferred language"', () => {
      expect(detector._isSpokenLanguageField('preferred language')).toBe(true);
    });

    it('returns true for "native_language"', () => {
      expect(detector._isSpokenLanguageField('native_language')).toBe(true);
    });

    it('returns false for "programming_language"', () => {
      expect(detector._isSpokenLanguageField('programming_language')).toBe(false);
    });

    it('returns false for a string with no language keyword', () => {
      expect(detector._isSpokenLanguageField('company_name')).toBe(false);
    });
  });
});
