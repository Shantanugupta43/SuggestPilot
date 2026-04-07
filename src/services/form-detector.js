/**
 * Form Field Detector
 * Identifies what kind of form field the user is typing in,
 * then assembles smart pre-fill suggestions from available context
 * (open tabs, page content, stored profile hints).
 *
 * Never touches: password, credit card, CVV, SSN, PIN, bank, auth, OTP.
 */

import { detectOS, detectBrowser } from '../utils/browser-detector.js';
import { isSpokenLanguageField, detectLanguages } from '../utils/language-detector.js';

class FormDetector {

  /**
   * Analyse a focused input element and return field metadata + smart fill candidates.
   * Returns null when the field is sensitive or unrecognisable.
   *
   * @param {Object} fieldMeta  - {name, id, placeholder, autocomplete, label, type, pageUrl, pageTitle}
   * @param {Object[]} openTabs - Array of {title, url} from context-collector
   * @param {string|null} preClassifiedType - fieldType already determined by content-script (skip re-classification)
   * @returns {Object|null}
   */
  analyzeField(fieldMeta, openTabs = [], preClassifiedType = null) {
    const fieldType = preClassifiedType || this._classifyField(fieldMeta);
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
    if (/(email|e-mail|mail)/.test(combined)) return 'sensitive';

    // ── Professional ────────────────────────────────────────────────────────
    if (/(job[_\s-]?title|position|role|designation|occupation)/.test(combined)) return 'job_title';
    if (/(company|employer|organisation|organization|workplace|firm)/.test(combined)) return 'company';
    if (/(linkedin|linked.in)/.test(combined)) return 'linkedin_url';
    if (/(github|git[_\s-]hub)/.test(combined)) return 'github_url';
    if (/(website|portfolio|personal[_\s-]?site|homepage|url|link)/.test(combined)) return 'website';
    if (/(years[_\s]?of[_\s]?exp|experience[_\s]?years|yoe)/.test(combined)) return 'experience_years';
    if (isSpokenLanguageField(combined)) return 'languages';
    if (/(pronouns?|preferred[_\s-]?pronouns?)/.test(combined)) return 'pronouns';
    if (/(education|education[_\s-]?level|highest[_\s-]?education|degree|qualification|academic[_\s-]?level)/.test(combined)) return 'education';
    if (/(skill|expertise|technology|tech[_\s]?stack|tools)/.test(combined)) return 'skills';
   
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
    if (/(^|\W)(timezone|time[_\s-]?zone|\btz\b)|_tz$/.test(combined)) return 'timezone';

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
        const os = detectOS();
        if (os) candidates.push({ value: os, source: 'Your device', confidence: 1.0 });
        break;
      }

      // ── Browser: detect from UA ────────────────────────────────────────────
      case 'browser': {
        const browser = detectBrowser();
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

      case 'languages': {
        const preferredLanguages = detectLanguages();
        preferredLanguages.forEach(language => {
          candidates.push({ value: language, source: 'Browser language preferences', confidence: 0.95 });
        });
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
        const os = detectOS();
        const browser = detectBrowser();
        if (os && browser) {
          candidates.push({
            value: `Environment: ${os} / ${browser}`,
            source: 'Your device',
            confidence: 0.9
          });
        }
        break;
      }

      // ── Timezone: detect from browser ─────────────────────────────────────
      case 'timezone': {
        try {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (tz) candidates.push({ value: tz, source: 'Your device', confidence: 1.0 });
        } catch (e) { /* unsupported by the browser*/ }
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
}

const formDetector = new FormDetector();
export default formDetector;
