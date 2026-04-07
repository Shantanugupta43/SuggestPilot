# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Configurable blocked domains list via popup UI (Settings → Blocked Domains)
- Expanded default blocked domains: banking, healthcare, government, and password manager sites
- Model selector with 4 Groq model options (Llama 3.1 8B, Llama 3.3 70B, Llama 3.1 70B, Gemma 2 9B)
- 15-second timeout on loading state to prevent indefinite "Thinking…" display
- Explicit handling for Chrome internal pages (`chrome://`, `about:`, etc.) in context collection
- Support for non-sensitive `type="number"` form fields (e.g., age, years of experience)
- Jest unit test suite (52 tests) for session-tracker, form-detector, groq-service, and config-manager
- Shared utility modules for browser detection (`browser-detector.js`) and language detection (`language-detector.js`)
- Centralized constants file (`constants.js`) replacing all hardcoded magic numbers
- `.eslintrc.json` for consistent code quality
- `CHANGELOG.md` and updated `CONTRIBUTING.md` with setup/testing guide

### Changed
- Session TTL aligned to 30 minutes (was mismatched at 2 hours in code vs 30 min in docs)
- `configManager.clear()` now removes only extension-specific keys instead of wiping all storage
- Dark mode preference persisted to `chrome.storage.local` across popup opens
- DOM element lookups in popup moved inside `initialize()` to prevent null references
- API key validation added on both popup save and service worker paths with specific error messages
- `testConnection` now displays actual API error messages (e.g., "Invalid API key", "Rate limited")
- `configManager.update()` uses deep merge instead of shallow merge to preserve nested config
- `groq-service.js` reads model dynamically from `configManager` instead of hardcoding
- Removed all debug `console.log` statements from production code
- Content script converted from IIFE to ES module for shared imports

### Removed
- Unused `openai` npm dependency
- Dead `rate-limiter.js` module (unused)
- Broken reference to non-existent `src/sidebar/sidebar.html` in manifest
- Broken `build` and `watch` npm scripts referencing missing files
- Duplicated OS/browser-language detection code (consolidated into shared utilities)

### Fixed
- XSS: `escapeHtml()` now applied to all interpolated values in overlay HTML
- `changeText()` null-safety for dark mode toggle DOM elements

---

## [1.0.0] - 2026-02-01

### Added
- Context-aware AI autocomplete suggestions powered by Groq's Llama 3.1 8B model
- Session intent tracking — remembers your research thread for smarter follow-up suggestions
- Smart form-fill — auto-detects 18+ field types (job title, company, OS, browser, timezone, etc.)
- Open tab analysis for browsing context
- Browsing history integration for personalized suggestions
- Frosted-glass overlay UI with keyboard navigation (Tab to accept, ↑↓ to cycle, Escape to dismiss)
- Google Search integration — detects and attaches to Google search input
- Claude.ai contenteditable support
- Extension popup with settings panel, dark mode toggle, and on/off switch
- Groq API key validation and connection testing
- Privacy-first design: no data stored or transmitted beyond Groq API calls
- Sensitive field detection — never shows overlay on passwords, credit cards, CVVs, etc.
- Configurable history tracking, tab analysis, and AI chat mode toggles
- Past search storage for recurring query context
- LinkedIn tab parsing for job title and company extraction
- Rate-limited API retry on 429 responses
