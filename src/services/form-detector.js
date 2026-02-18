/**
 * Form Field Detector
 * Identifies what kind of form field the user is typing in,
 * then assembles smart pre-fill suggestions from available context
 * (open tabs, page content, stored profile hints).
 *
 * Never touches: password, credit card, CVV, SSN, PIN, bank, auth, OTP.
 */

class FormDetector {

  /**
   * Analyse a focused input element and return field metadata + smart fill candidates.
   * Returns null when the field is sensitive or unrecognisable.
   *
   * @param {Object} fieldMeta  - {name, id, placeholder, autocomplete, label, type, pageUrl, pageTitle}
   * @param {Object[]} openTabs - Array of {title, url} from context-collector
   * @returns {Object|null}
   */
  analyzeField(fieldMeta, openTabs = []) {
    const fieldType = this._classifyField(fieldMeta);
    if (!fieldType || fieldType === 'sensitive') return null;

    const candidates = this._buildCandidates(fieldType, fieldMeta, openTabs);

    return {
      fieldType,
      fieldLabel: fieldMeta.label || fieldMeta.placeholder || fieldMeta.name || fieldMeta.id || 'field',
      candidates,          // [{value, source, confidence}]
      isFormFill: candidates.length > 0
    };
  }

  /**
   * Classify the field into a semantic category.
   */
  _classifyField(meta) {
    const combined = [
      meta.name, meta.id, meta.placeholder,
      meta.autocomplete, meta.label, meta.type
    ].join(' ').toLowerCase();

    // ── Sensitive (never touch) ─────────────────────────────────────────────
    const sensitive = [
      'password', 'passwd', 'pwd', 'credit', 'card', 'cvv', 'cvc',
      'ssn', 'social security', 'bank', 'pin', 'otp', 'auth', 'token',
      'verification code', 'secret'
    ];
    if (sensitive.some(k => combined.includes(k))) return 'sensitive';
    if (meta.type === 'password' || meta.type === 'tel') return 'sensitive';

    // ── Identity ────────────────────────────────────────────────────────────
    if (/(^|\W)(first[_\s-]?name|fname|given[_\s-]?name)(\W|$)/.test(combined)) return 'first_name';
    if (/(^|\W)(last[_\s-]?name|lname|family[_\s-]?name|surname)(\W|$)/.test(combined)) return 'last_name';
    if (/(^|\W)(full[_\s-]?name|your[_\s-]?name|name)(\W|$)/.test(combined)) return 'full_name';
    if (/(email|e-mail|mail)/.test(combined)) return 'email';

    // ── Professional ────────────────────────────────────────────────────────
    if (/(job[_\s-]?title|position|role|designation|occupation)/.test(combined)) return 'job_title';
    if (/(company|employer|organisation|organization|workplace|firm)/.test(combined)) return 'company';
    if (/(linkedin|linked.in)/.test(combined)) return 'linkedin_url';
    if (/(github|git[_\s-]hub)/.test(combined)) return 'github_url';
    if (/(website|portfolio|personal[_\s-]?site|homepage|url|link)/.test(combined)) return 'website';
    if (/(years[_\s]?of[_\s]?exp|experience[_\s]?years|yoe)/.test(combined)) return 'experience_years';
    if (/(skill|expertise|technology|tech[_\s]?stack|languages|tools)/.test(combined)) return 'skills';

    // ── Support / bug report ─────────────────────────────────────────────────
    if (/(os|operating[_\s]?system|platform)/.test(combined)) return 'os';
    if (/(browser|user[_\s]?agent)/.test(combined)) return 'browser';
    if (/(version|app[_\s]?version|software[_\s]?version)/.test(combined)) return 'version';
    if (/(subject|issue[_\s]?title|ticket[_\s]?title|summary)/.test(combined)) return 'issue_subject';
    if (/(description|details|body|message|explain|steps)/.test(combined)) return 'issue_description';

    // ── Location ────────────────────────────────────────────────────────────
    if (/(city|town|municipality)/.test(combined)) return 'city';
    if (/(country)/.test(combined)) return 'country';
    if (/(zip|postal|postcode)/.test(combined)) return 'zip';

    // ── Search / generic ────────────────────────────────────────────────────
    if (meta.type === 'search' || /(search|query|q)/.test(combined)) return 'search';

    return null; // unrecognised — fall back to normal suggestions
  }

  /**
   * Build fill candidates for a given field type, drawing from available signals.
   */
  _buildCandidates(fieldType, meta, openTabs) {
    const candidates = [];

    switch (fieldType) {

      // ── Job title: look for LinkedIn tab ──────────────────────────────────
      case 'job_title': {
        const liTab = openTabs.find(t => t.url?.includes('linkedin.com'));
        if (liTab) {
          const title = this._extractJobTitleFromLinkedIn(liTab.title);
          if (title) candidates.push({ value: title, source: 'LinkedIn tab', confidence: 0.85 });
        }
        break;
      }

      // ── Company: look for LinkedIn or company website tab ──────────────────
      case 'company': {
        const liTab = openTabs.find(t => t.url?.includes('linkedin.com'));
        if (liTab) {
          const company = this._extractCompanyFromLinkedIn(liTab.title);
          if (company) candidates.push({ value: company, source: 'LinkedIn tab', confidence: 0.8 });
        }
        break;
      }

      // ── OS: detect from browser UA ─────────────────────────────────────────
      case 'os': {
        const os = this._detectOS();
        if (os) candidates.push({ value: os, source: 'Your device', confidence: 1.0 });
        break;
      }

      // ── Browser: detect from UA ────────────────────────────────────────────
      case 'browser': {
        const browser = this._detectBrowser();
        if (browser) candidates.push({ value: browser, source: 'Your device', confidence: 1.0 });
        break;
      }

      // ── Skills: look for GitHub or portfolio tab ───────────────────────────
      case 'skills': {
        const ghTab = openTabs.find(t => t.url?.includes('github.com'));
        if (ghTab) {
          const skills = this._extractSkillsFromGitHub(ghTab.title);
          if (skills) candidates.push({ value: skills, source: 'GitHub tab', confidence: 0.7 });
        }
        break;
      }

      // ── LinkedIn URL: if LinkedIn tab is open ─────────────────────────────
      case 'linkedin_url': {
        const liTab = openTabs.find(t =>
          t.url?.includes('linkedin.com/in/') || t.url?.includes('linkedin.com/pub/')
        );
        if (liTab) candidates.push({ value: liTab.url, source: 'LinkedIn tab', confidence: 0.95 });
        break;
      }

      // ── GitHub URL: if GitHub profile tab open ────────────────────────────
      case 'github_url': {
        const ghTab = openTabs.find(t => /github\.com\/[^/]+\/?$/.test(t.url || ''));
        if (ghTab) candidates.push({ value: ghTab.url, source: 'GitHub tab', confidence: 0.95 });
        break;
      }

      // ── Website: if portfolio/personal site tab open ──────────────────────
      case 'website': {
        const siteTab = openTabs.find(t => {
          const url = t.url || '';
          return (
            !url.includes('google.') &&
            !url.includes('github.com') &&
            !url.includes('linkedin.com') &&
            !url.includes('chrome://') &&
            (t.title?.toLowerCase().includes('portfolio') ||
             t.title?.toLowerCase().includes('personal') ||
             t.url?.includes('portfolio'))
          );
        });
        if (siteTab) candidates.push({ value: siteTab.url, source: 'Portfolio tab', confidence: 0.75 });
        break;
      }

      // ── Issue subject: derive from current page title ─────────────────────
      case 'issue_subject': {
        if (meta.pageTitle) {
          const clean = meta.pageTitle.replace(/[-|–—].*$/, '').trim();
          if (clean.length > 4) {
            candidates.push({ value: `Issue with ${clean}`, source: 'Current page', confidence: 0.6 });
          }
        }
        break;
      }

      // ── Issue description: include OS + browser automatically ──────────────
      case 'issue_description': {
        const os = this._detectOS();
        const browser = this._detectBrowser();
        if (os && browser) {
          candidates.push({
            value: `Environment: ${os} / ${browser}`,
            source: 'Your device',
            confidence: 0.9
          });
        }
        break;
      }

      default:
        break;
    }

    return candidates;
  }

  // ─── Extraction helpers ────────────────────────────────────────────────────

  _extractJobTitleFromLinkedIn(title) {
    if (!title) return null;
    // LinkedIn page titles are often: "Name | Job Title at Company | LinkedIn"
    const match = title.match(/\|\s*([^|@]+?)\s+at\s+/i);
    if (match) return match[1].trim();
    // Or: "Name - Job Title - LinkedIn"
    const match2 = title.match(/-\s*([^-]+?)\s*-\s*LinkedIn/i);
    if (match2) return match2[1].trim();
    return null;
  }

  _extractCompanyFromLinkedIn(title) {
    if (!title) return null;
    const match = title.match(/at\s+([^|@\-]+)/i);
    if (match) return match[1].trim().replace(/\s*\|.*$/, '').trim();
    return null;
  }

  _extractSkillsFromGitHub(title) {
    if (!title) return null;
    // GitHub profile: "username (Full Name) · GitHub" — not much to extract.
    // Return null and let the AI build skills suggestions from history instead.
    return null;
  }

  _detectOS() {
    const ua = navigator.userAgent;
    if (/Windows NT 11/.test(ua)) return 'Windows 11';
    if (/Windows NT 10/.test(ua)) return 'Windows 10';
    if (/Mac OS X/.test(ua)) {
      const v = ua.match(/Mac OS X ([\d_]+)/);
      return v ? `macOS ${v[1].replace(/_/g, '.')}` : 'macOS';
    }
    if (/Linux/.test(ua)) return 'Linux';
    if (/Android/.test(ua)) {
      const v = ua.match(/Android ([\d.]+)/);
      return v ? `Android ${v[1]}` : 'Android';
    }
    if (/iPhone|iPad/.test(ua)) return 'iOS';
    return null;
  }

  _detectBrowser() {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) {
      const v = ua.match(/Edg\/([\d.]+)/);
      return `Microsoft Edge ${v ? v[1].split('.')[0] : ''}`.trim();
    }
    if (/OPR\//.test(ua)) {
      const v = ua.match(/OPR\/([\d.]+)/);
      return `Opera ${v ? v[1].split('.')[0] : ''}`.trim();
    }
    if (/Chrome\//.test(ua)) {
      const v = ua.match(/Chrome\/([\d.]+)/);
      return `Chrome ${v ? v[1].split('.')[0] : ''}`.trim();
    }
    if (/Firefox\//.test(ua)) {
      const v = ua.match(/Firefox\/([\d.]+)/);
      return `Firefox ${v ? v[1].split('.')[0] : ''}`.trim();
    }
    if (/Safari\//.test(ua)) return 'Safari';
    return null;
  }
}

const formDetector = new FormDetector();
export default formDetector;