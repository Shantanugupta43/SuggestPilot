/**
 * Enhanced Content Script - Works EVERYWHERE
 * + Smart Form-Fill detection
 * + Session-aware suggestion labels
 */

(function() {
  'use strict';

  let currentInput = null;
  let suggestionOverlay = null;
  let currentSuggestions = [];
  let activeSuggestionIndex = 0;
  let debounceTimer = null;
  let lastInputValue = '';
  let isAddressBar = false;

  // Sites where the extension should stay completely silent
  const BLOCKED_DOMAINS = [
    'linkedin.com'
  ];

  // ── Form-fill detector (inline, no import needed in content scripts) ────────
  const FORM_FIELD_PATTERNS = {
    sensitive: ['password', 'passwd', 'pwd', 'credit', 'card', 'cvv', 'cvc', 'ssn', 'bank', 'pin', 'otp', 'auth', 'token', 'secret'],
    job_title: ['job_title', 'jobtitle', 'position', 'role', 'designation', 'occupation', 'title'],
    company:   ['company', 'employer', 'organisation', 'organization', 'workplace', 'firm'],
    os:        ['operating_system', 'operatingsystem', 'platform', ' os '],
    browser:   ['browser', 'useragent', 'user_agent'],
    version:   ['version', 'appversion', 'softwareversion'],
    skills:    ['skill', 'expertise', 'technology', 'techstack', 'languages', 'tools'],
    linkedin_url: ['linkedin'],
    github_url:   ['github'],
    issue_subject:  ['subject', 'issuetitle', 'tickettitle', 'summary'],
    issue_description: ['description', 'details', 'body', 'message', 'explain', 'steps']
  };

  function classifyField(element) {
    if (!element) return null;
    const combined = [
      element.name, element.id, element.placeholder,
      element.getAttribute('autocomplete'),
      element.getAttribute('aria-label'),
      element.type
    ].join(' ').toLowerCase().replace(/[-\s]/g, '_');

    for (const [type, keywords] of Object.entries(FORM_FIELD_PATTERNS)) {
      if (keywords.some(k => combined.includes(k.replace(/[-\s]/g, '_')))) {
        return type === 'sensitive' ? null : type;
      }
    }
    return null;
  }

  function detectOS() {
    const ua = navigator.userAgent;
    if (/Windows NT 11/.test(ua)) return 'Windows 11';
    if (/Windows NT 10/.test(ua)) return 'Windows 10';
    if (/Mac OS X/.test(ua)) { const v = ua.match(/Mac OS X ([\d_]+)/); return v ? `macOS ${v[1].replace(/_/g,'.')}` : 'macOS'; }
    if (/Linux/.test(ua)) return 'Linux';
    if (/Android/.test(ua)) { const v = ua.match(/Android ([\d.]+)/); return v ? `Android ${v[1]}` : 'Android'; }
    if (/iPhone|iPad/.test(ua)) return 'iOS';
    return null;
  }

  function detectBrowser() {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) { const v = ua.match(/Edg\/([\d.]+)/); return `Edge ${v ? v[1].split('.')[0] : ''}`.trim(); }
    if (/OPR\//.test(ua)) { const v = ua.match(/OPR\/([\d.]+)/); return `Opera ${v ? v[1].split('.')[0] : ''}`.trim(); }
    if (/Chrome\//.test(ua)) { const v = ua.match(/Chrome\/([\d.]+)/); return `Chrome ${v ? v[1].split('.')[0] : ''}`.trim(); }
    if (/Firefox\//.test(ua)) { const v = ua.match(/Firefox\/([\d.]+)/); return `Firefox ${v ? v[1].split('.')[0] : ''}`.trim(); }
    if (/Safari\//.test(ua)) return 'Safari';
    return null;
  }

  /**
   * Build fieldMeta for service worker — includes local candidates where deterministic.
   */
  function buildFieldMeta(element) {
    const fieldType = classifyField(element);
    if (!fieldType) return null;

    const nearbyLabel = getNearbyLabel(element);
    const meta = {
      fieldType,
      fieldLabel: nearbyLabel || element.placeholder || element.name || element.id || fieldType,
      isFormFill: false,
      candidates: []
    };

    // Provide deterministic local candidates (no AI needed)
    if (fieldType === 'os') {
      const os = detectOS();
      if (os) { meta.candidates.push({ value: os, source: 'Your device', confidence: 1.0 }); meta.isFormFill = true; }
    }
    if (fieldType === 'browser') {
      const browser = detectBrowser();
      if (browser) { meta.candidates.push({ value: browser, source: 'Your device', confidence: 1.0 }); meta.isFormFill = true; }
    }
    if (fieldType === 'issue_description') {
      const os = detectOS(); const browser = detectBrowser();
      if (os && browser) {
        meta.candidates.push({ value: `${os} / ${browser}`, source: 'Your device', confidence: 0.9 });
        meta.isFormFill = true;
      }
    }

    return meta;
  }

  /**
   * Walk up the DOM to find a nearby <label> text.
   */
  function getNearbyLabel(element) {
    // Check for associated label via 'for' attribute
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) return label.textContent.trim();
    }
    // Check parent label
    let parent = element.parentElement;
    for (let i = 0; i < 4; i++) {
      if (!parent) break;
      if (parent.tagName === 'LABEL') return parent.textContent.trim().replace(element.value || '', '').trim();
      // Sibling label
      const siblingLabel = parent.querySelector('label');
      if (siblingLabel) return siblingLabel.textContent.trim();
      parent = parent.parentElement;
    }
    return null;
  }

  // ── Overlay setup ──────────────────────────────────────────────────────────

  function isBlockedDomain() {
    const host = window.location.hostname.toLowerCase();
    return BLOCKED_DOMAINS.some(domain => host.includes(domain));
  }

  function initialize() {
    if (isBlockedDomain()) {
      console.log('AI Context Assistant: disabled on', window.location.hostname);
      return;
    }
    setupInputTracking();
    setupMessageListener();
    createSuggestionOverlay();
    setupAddressBarDetection();
    console.log('AI Context Assistant - Session+FormFill mode active');
  }

  function createSuggestionOverlay() {
    suggestionOverlay = document.createElement('div');
    suggestionOverlay.id = 'ai-context-suggestion-overlay';

    suggestionOverlay.style.cssText = `
      position: fixed;
      background: rgba(20, 20, 28, 0.42);
      backdrop-filter: saturate(180%) blur(28px);
      -webkit-backdrop-filter: saturate(180%) blur(28px);
      border-radius: 16px;
      padding: 13px 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
      font-size: 13.5px;
      color: rgba(255, 255, 255, 0.96);
      letter-spacing: -0.01em;
      pointer-events: none;
      z-index: 999999;
      display: none;
      max-width: 600px;
      box-shadow:
        0 1px 0 rgba(255,255,255,0.12) inset,
        0 16px 48px rgba(0,0,0,0.38),
        0 4px 16px rgba(0,0,0,0.18);
      border: 1px solid rgba(255, 255, 255, 0.18);
      animation: aiSlideIn 0.18s cubic-bezier(0.34, 1.26, 0.64, 1);
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes aiSlideIn {
        from { opacity: 0; transform: translateY(-6px) scale(0.98); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes aiPulse {
        0%, 100% { opacity: 0.35; }
        50% { opacity: 1; }
      }
      #ai-context-suggestion-overlay strong { color: #fff; font-weight: 600; }

      /* Form-fill badge — warm amber tint to distinguish from regular suggestions */
      .ai-form-fill-badge {
        background: rgba(255, 180, 50, 0.18);
        border: 1px solid rgba(255, 180, 50, 0.35);
        border-radius: 20px;
        padding: 1px 8px;
        font-size: 10px;
        font-weight: 600;
        color: rgba(255, 200, 80, 0.9);
        letter-spacing: 0.04em;
      }

      /* Session badge — blue tint */
      .ai-session-badge {
        background: rgba(74, 144, 226, 0.18);
        border: 1px solid rgba(74, 144, 226, 0.35);
        border-radius: 20px;
        padding: 1px 8px;
        font-size: 10px;
        font-weight: 600;
        color: rgba(120, 180, 255, 0.9);
        letter-spacing: 0.04em;
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(suggestionOverlay);
  }

  function setupAddressBarDetection() {
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        if (url.includes('google.com/search')) setTimeout(() => attachToGoogleSearch(), 100);
      }
    }).observe(document, { subtree: true, childList: true });

    if (location.href.includes('google.com/search')) setTimeout(() => attachToGoogleSearch(), 500);
  }

  function attachToGoogleSearch() {
    const selectors = ['input[name="q"]', 'textarea[name="q"]', 'input[aria-label*="Search"]', '.gLFyf', 'input[type="search"]'];
    for (const selector of selectors) {
      const searchInput = document.querySelector(selector);
      if (searchInput && !searchInput.dataset.aiAssistantAttached) {
        searchInput.dataset.aiAssistantAttached = 'true';
        attachInputListeners(searchInput);
        searchInput.addEventListener('focus', () => { currentInput = searchInput; isAddressBar = true; });
        break;
      }
    }
  }

  function setupInputTracking() {
    document.addEventListener('focusin', (e) => {
      const target = e.target;
      if (isInputElement(target)) {
        currentInput = target;
        lastInputValue = getInputValue(target);
        isAddressBar = isGoogleSearchInput(target);

        if (isSensitiveField(target)) {
          currentInput = null;
          hideSuggestion();
          return;
        }
        attachInputListeners(target);
      }
    }, true);

    document.addEventListener('focusout', (e) => {
      if (currentInput === e.target) {
        setTimeout(() => {
          hideSuggestion();
          currentInput = null;
          currentSuggestions = [];
          isAddressBar = false;
        }, 200);
      }
    }, true);

    if (window.location.href.includes('claude.ai')) setupClaudeInputDetection();
  }

  function setupClaudeInputDetection() {
    const selectors = ['.ProseMirror', 'div[contenteditable="true"]', 'div[role="textbox"]'];
    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input && input.offsetHeight > 0) { attachInputListeners(input); return; }
    }
    let attempts = 0;
    const observer = new MutationObserver(() => {
      attempts++;
      for (const selector of selectors) {
        const input = document.querySelector(selector);
        if (input && input.offsetHeight > 0) { attachInputListeners(input); observer.disconnect(); return; }
      }
      if (attempts >= 20) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: false });
    setTimeout(() => {
      for (const selector of selectors) {
        const input = document.querySelector(selector);
        if (input && input.offsetHeight > 0 && !input.dataset.listenersAttached) { attachInputListeners(input); observer.disconnect(); return; }
      }
    }, 1500);
  }

  function isGoogleSearchInput(element) {
    if (!element) return false;
    const url = window.location.href.toLowerCase();
    if (!url.includes('google.com')) return false;
    return element.name?.toLowerCase() === 'q' ||
           element.getAttribute('aria-label')?.toLowerCase().includes('search') ||
           element.classList.contains('gLFyf');
  }

  function getInputValue(input) {
    return input.contentEditable === 'true' ? (input.textContent || '') : (input.value || '');
  }

  function setInputValue(input, value) {
    if (input.contentEditable === 'true') input.textContent = value;
    else input.value = value;
  }

  function attachInputListeners(input) {
    if (input.dataset.listenersAttached) return;
    input.dataset.listenersAttached = 'true';

    const inputHandler = () => {
      if (currentInput !== input) return;
      const value = getInputValue(input);
      if (value !== lastInputValue && value.trim().length >= 1) {
        lastInputValue = value;
        debouncedGenerateSuggestions(input, value);
      } else if (value.trim().length === 0) {
        hideSuggestion();
        currentSuggestions = [];
      }
    };

    const keydownHandler = (e) => {
      if (currentInput !== input) return;
      if (e.key === 'Tab' && currentSuggestions.length > 0) { e.preventDefault(); acceptSuggestion(); return; }
      if (e.key === 'ArrowDown' && currentSuggestions.length > 1) { e.preventDefault(); activeSuggestionIndex = (activeSuggestionIndex + 1) % currentSuggestions.length; updateSuggestionDisplay(); }
      if (e.key === 'ArrowUp' && currentSuggestions.length > 1) { e.preventDefault(); activeSuggestionIndex = (activeSuggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length; updateSuggestionDisplay(); }
      if (e.key === 'Escape') { hideSuggestion(); currentSuggestions = []; }
    };

    input.addEventListener('input', inputHandler);
    input.addEventListener('keydown', keydownHandler);
    if (input.contentEditable === 'true') input.addEventListener('DOMCharacterDataModified', inputHandler);
  }

  function debouncedGenerateSuggestions(input, value) {
    clearTimeout(debounceTimer);
    showSuggestionLoading(input);
    const delay = isAddressBar ? 400 : 500;
    debounceTimer = setTimeout(() => generateSuggestions(input, value), delay);
  }

  async function generateSuggestions(input, value) {
    try {
      // Build form field metadata from the focused element
      const fieldMeta = buildFieldMeta(input);

      const pageContext = {
        active_input_text: value,
        page_type: detectPageType(),
        current_page: {
          title: document.title,
          url: window.location.href,
          headings: Array.from(document.querySelectorAll('h1, h2, h3'))
            .slice(0, 5).map(h => h.textContent.trim()).filter(Boolean)
        },
        is_address_bar: isAddressBar,
        is_ai_chat: window.location.href.includes('claude.ai') || window.location.href.includes('chat.openai.com')
      };

      const response = await chrome.runtime.sendMessage({
        action: 'generateSuggestions',
        data: {
          context: pageContext,
          fieldName: input.name || input.id || input.placeholder || '',
          // ── New: send form metadata to service worker ──────────────────
          fieldMeta
        }
      });

      // Stale check
      const currentValue = getInputValue(input);
      if (currentValue !== value) { console.log('Stale result discarded'); return; }

      if (response && response.success) {
        const suggestions = response.suggestions || [];
        if (suggestions.length > 0) {
          currentSuggestions = suggestions;
          activeSuggestionIndex = 0;
          showSuggestion(input, currentSuggestions[0], response.reason, response.isFormFill);
        } else {
          hideSuggestion();
          currentSuggestions = [];
        }
      } else {
        hideSuggestion();
        currentSuggestions = [];
      }
    } catch (error) {
      console.error('Failed to generate suggestions:', error);
      hideSuggestion();
      currentSuggestions = [];
    }
  }

  function acceptSuggestion() {
    if (!currentInput || currentSuggestions.length === 0) return;
    const suggestion = currentSuggestions[activeSuggestionIndex];
    const suggestionText = typeof suggestion === 'string' ? suggestion : suggestion.text;
    if (!suggestionText) return;

    setInputValue(currentInput, suggestionText);
    currentInput.dispatchEvent(new Event('input', { bubbles: true }));
    currentInput.dispatchEvent(new Event('change', { bubbles: true }));
    if (currentInput.contentEditable === 'true') currentInput.dispatchEvent(new Event('textInput', { bubbles: true }));

    lastInputValue = suggestionText;
    hideSuggestion();
    currentSuggestions = [];

    if (currentInput.setSelectionRange) {
      currentInput.setSelectionRange(suggestionText.length, suggestionText.length);
    } else if (currentInput.contentEditable === 'true') {
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(currentInput);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  // ── Display ────────────────────────────────────────────────────────────────

  function showSuggestion(input, suggestionData, reason = '', isFormFill = false) {
    const text = typeof suggestionData === 'string' ? suggestionData : suggestionData.text;
    const derivation = typeof suggestionData === 'object' ? suggestionData.derivation : null;

    if (!suggestionOverlay) return;

    const rect = input.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 10;
    const left = rect.left + window.scrollX;
    if (isAddressBar) top = rect.bottom + window.scrollY + 14;

    suggestionOverlay.style.display = 'block';
    suggestionOverlay.style.left = `${left}px`;
    suggestionOverlay.style.top = `${top}px`;
    suggestionOverlay.style.width = `${Math.max(rect.width, 320)}px`;

    // Counter pill
    const counter = currentSuggestions.length > 1
      ? `<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(255,255,255,0.12);border-radius:20px;padding:1px 7px;font-size:10px;font-weight:500;letter-spacing:0.02em;">↑↓ ${activeSuggestionIndex + 1}/${currentSuggestions.length}</span>`
      : '';

    // ── Badge: form-fill (amber) vs session-aware (blue) vs default ──────────
    let badge = '';
    if (isFormFill) {
      badge = `<span class="ai-form-fill-badge">⚡ Smart Fill</span>`;
    } else {
      // Check if derivation references session thread
      const isSessionBased = derivation?.toLowerCase().includes('session') ||
                             derivation?.toLowerCase().includes('thread') ||
                             derivation?.toLowerCase().startsWith('session:');
      if (isSessionBased) {
        badge = `<span class="ai-session-badge">🧠 Session</span>`;
      } else if (isAddressBar) {
        badge = `<span style="background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.14);border-radius:20px;padding:1px 7px;font-size:10px;font-weight:500;letter-spacing:0.03em;color:rgba(255,255,255,0.7);">🔍 Search</span>`;
      } else if (window.location.href.includes('claude.ai') || window.location.href.includes('chat.openai.com')) {
        badge = `<span style="background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.14);border-radius:20px;padding:1px 7px;font-size:10px;font-weight:500;letter-spacing:0.03em;color:rgba(255,255,255,0.7);">🤖 AI Chat</span>`;
      }
    }

    const topRow = (badge || counter)
      ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:7px;">${badge}${counter}</div>`
      : '';

    const caption = (derivation || reason)
      ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.10);font-size:11px;color:rgba(255,255,255,0.52);line-height:1.45;font-weight:400;">${escapeHtml(derivation || reason)}</div>`
      : '';

    suggestionOverlay.innerHTML = `
      ${topRow}
      <div style="font-weight:500;font-size:13.5px;line-height:1.4;color:rgba(255,255,255,0.97);margin-bottom:3px;">${escapeHtml(text)}</div>
      <div style="font-size:10.5px;color:rgba(255,255,255,0.38);font-weight:400;">Tab to accept${currentSuggestions.length > 1 ? ' · ↑↓ to cycle' : ''}</div>
      ${caption}
    `;
  }

  function showSuggestionLoading(input) {
    if (!suggestionOverlay) return;
    const rect = input.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 10;
    const left = rect.left + window.scrollX;
    if (isAddressBar) top = rect.bottom + window.scrollY + 14;

    suggestionOverlay.style.display = 'block';
    suggestionOverlay.style.left = `${left}px`;
    suggestionOverlay.style.top = `${top}px`;
    suggestionOverlay.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:rgba(255,255,255,0.55);font-weight:400;">
        <span style="display:inline-flex;gap:3px;align-items:center;">
          <span style="width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,0.7);display:inline-block;animation:aiPulse 1.2s ease-in-out 0s infinite;"></span>
          <span style="width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,0.7);display:inline-block;animation:aiPulse 1.2s ease-in-out 0.2s infinite;"></span>
          <span style="width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,0.7);display:inline-block;animation:aiPulse 1.2s ease-in-out 0.4s infinite;"></span>
        </span>
        Thinking…
      </div>
    `;
  }

  function updateSuggestionDisplay() {
    if (currentSuggestions.length === 0 || !currentInput) return;
    showSuggestion(currentInput, currentSuggestions[activeSuggestionIndex]);
  }

  function hideSuggestion() {
    if (suggestionOverlay) suggestionOverlay.style.display = 'none';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function detectPageType() {
    const url = window.location.href.toLowerCase();
    if (url.includes('chat.openai.com') || url.includes('claude.ai') || url.includes('gemini.google.com') || url.includes('copilot.microsoft.com')) return 'ai_chat';
    if (url.includes('github.com') || url.includes('stackoverflow.com')) return 'coding';
    if (url.includes('google.com/search') || url.includes('bing.com/search')) return 'search';
    if (url.includes('docs.') || document.title.toLowerCase().includes('documentation')) return 'documentation';
    return 'general';
  }

  function isInputElement(element) {
    if (!element) return false;
    const tagName = element.tagName?.toLowerCase();
    const type = element.type?.toLowerCase();
    if (tagName === 'textarea') return true;
    if (tagName === 'input' && (type === 'text' || type === 'search' || type === 'email' || type === 'url' || !type)) return true;
    if (element.contentEditable === 'true') return true;
    if (element.getAttribute('role') === 'textbox') return true;
    return false;
  }

  function isSensitiveField(element) {
    if (!element) return false;
    const type = element.type?.toLowerCase();
    if (type === 'password' || type === 'tel' || type === 'number') return true;
    const combinedText = `${element.name} ${element.id} ${element.autocomplete} ${element.placeholder}`.toLowerCase();
    return ['password', 'passwd', 'credit', 'card', 'cvv', 'ssn', 'bank', 'pin', 'token', 'auth', 'login', 'otp', 'verification'].some(k => combinedText.includes(k));
  }

  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      handleMessage(request).then(sendResponse).catch(error => sendResponse({ error: error.message }));
      return true;
    });
  }

  async function handleMessage(request) {
    switch (request.action) {
      case 'getPageContext': return getPageContext();
      case 'getActiveInput': return getActiveInput();
      case 'insertSuggestion': return insertSuggestion(request.data.text);
      case 'toggleExtension':
        if (!request.data.enabled) hideSuggestion();
        return { success: true };
      default: throw new Error(`Unknown action: ${request.action}`);
    }
  }

  function getPageContext() {
    const context = { title: document.title, headings: [], summary: '', mainContent: '', chatHistory: [] };
    try {
      context.headings = Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 10).map(h => h.textContent.trim()).filter(Boolean);
      const metaDesc = document.querySelector('meta[name="description"]');
      context.summary = metaDesc ? metaDesc.content : '';

      const url = window.location.href.toLowerCase();
      if (url.includes('chat.openai.com')) {
        const messages = Array.from(document.querySelectorAll('[data-message-author-role]')).slice(-5).map(m => m.textContent.trim()).filter(Boolean);
        if (messages.length) { context.mainContent = messages.join('\n---\n'); context.chatHistory = messages; }
      } else if (url.includes('claude.ai')) {
        let messages = Array.from(document.querySelectorAll('[data-test-render-count]')).slice(-5).map(m => m.textContent.trim()).filter(Boolean);
        if (!messages.length) messages = Array.from(document.querySelectorAll('.font-user-message, .font-claude-message')).slice(-5).map(m => m.textContent.trim()).filter(Boolean);
        if (messages.length) { context.mainContent = messages.join('\n---\n'); context.chatHistory = messages; }
      } else {
        const mainEl = document.querySelector('main, article, .content, #content');
        if (mainEl) context.mainContent = mainEl.textContent.trim().substring(0, 1000);
      }
    } catch (error) { console.error('Error in getPageContext:', error); }
    return context;
  }

  function getActiveInput() {
    if (!currentInput || isSensitiveField(currentInput)) return { text: '' };
    return { text: getInputValue(currentInput).trim() };
  }

  function insertSuggestion(text) {
    if (!currentInput || isSensitiveField(currentInput)) return { success: false, error: 'No active input field' };
    try {
      setInputValue(currentInput, text);
      currentInput.dispatchEvent(new Event('input', { bubbles: true }));
      currentInput.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();