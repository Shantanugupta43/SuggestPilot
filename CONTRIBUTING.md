# Contributing to SuggestPilot

Thanks for your interest in contributing! This guide will get you set up and running in minutes.

---

## Quick Start

### 1. Prerequisites

- **Node.js** 18+ and **npm** — [install from nodejs.org](https://nodejs.org/)
- **Google Chrome** (or any Chromium-based browser)

### 2. Clone the Repository

```bash
git clone https://github.com/Shantanugupta43/SuggestPilot.git
cd SuggestPilot
```

### 3. Install Dependencies

```bash
npm install
```

This installs dev dependencies for testing, linting, and formatting. No build step is needed — the extension runs directly from source.

### 4. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** using the toggle in the top-right corner
3. Click **Load unpacked**
4. Select the root folder of this project (the `SuggestPilot` directory)
5. The extension icon appears in your toolbar 🎉

### 5. Get a Groq API Key

1. Sign up at **[console.groq.com/keys](https://console.groq.com/keys)** — no credit card required
2. Copy your API key (it starts with `gsk_`)

### 6. Configure the Extension

1. Click the SuggestPilot icon in your toolbar
2. Click **Configure Settings** (or the gear icon)
3. Paste your Groq API key
4. Click **Save Settings**
5. Click **Test Connection** to verify everything works

### 7. Verify It Works

1. Open any website (e.g., google.com)
2. Focus a text input field and start typing
3. After ~500ms, a frosted-glass overlay with AI suggestions should appear
4. Press **Tab** to accept a suggestion, **↑/↓** to cycle, **Escape** to dismiss

### 8. Run the Test Suite

```bash
npm test
```

This runs Jest tests covering session tracking, form detection, JSON parsing, and configuration management. All tests should pass.

### 9. Lint and Format

```bash
npm run lint     # Check for code issues
npm run format   # Auto-format code with Prettier
```

---

## Project Structure

```
SuggestPilot/
├── manifest.json              # Chrome extension config (Manifest V3)
├── package.json               # Dependencies and scripts
├── src/
│   ├── background/
│   │   └── service-worker.js  # Central orchestration
│   ├── content/
│   │   └── content-script.js  # Runs on every page, handles UI overlay
│   ├── popup/
│   │   ├── popup.html         # Extension popup UI
│   │   ├── popup.css          # Styles
│   │   └── popup.js           # Popup logic
│   ├── config/
│   │   └── config-manager.js  # Settings storage and validation
│   ├── services/
│   │   ├── groq-service.js    # Groq API calls and prompt building
│   │   ├── session-tracker.js # Research session tracking
│   │   ├── form-detector.js   # Form field classification
│   │   └── context-collector.js # Browser context aggregation
│   └── utils/
│       ├── constants.js       # Shared configuration values
│       ├── browser-detector.js  # OS/browser detection
│       └── language-detector.js # Language detection
└── __tests__/                 # Jest test files
```

---

## How to Contribute

### 1. Fork the Repository

Click **Fork** on GitHub to create your own copy.

### 2. Create a Branch

```bash
git checkout -b feature/short-description
# Examples:
#   feature/add-timezone-field
#   fix/session-expiry-logic
#   refactor/prompt-builder
```

Keep branches small and focused on one change.

### 3. Make Your Changes

Before committing:

- **Test locally** — reload the extension at `chrome://extensions` and verify it works
- **No console errors** — open DevTools (F12) and check the Console tab
- **Valid JSON** — ensure Groq API responses are still parsed correctly
- **No typing lag** — verify debounce timing hasn't been degraded
- **Sensitive fields** — confirm password/email/credit card fields never show the overlay
- **Run tests** — `npm test` should pass

### 4. Commit and Push

```bash
git add .
git commit -m "describe your change clearly"
git push origin feature/short-description
```

### 5. Open a Pull Request

Go to your fork on GitHub and click **Compare & pull request**. Fill in the PR template with what changed and why.

---

## Good First Contributions

- **Add form field types** — expand `form-detector.js` to recognize more field patterns
- **Blocked domains** — add sites where suggestions are unwanted
- **Tests** — write more test cases (see `__tests__/`)
- **Documentation** — improve README, privacy policy, or this file

---

## Need Help?

Open an issue on [GitHub Issues](https://github.com/Shantanugupta43/SuggestPilot/issues) — we're happy to help!
