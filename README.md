# SuggestPilot AI Context Assistant

**A Chrome extension that generates intelligent, context-aware autocomplete suggestions as you type — powered by Groq's free LLM API.**


## 🙌 Contributors

Thanks to everyone who has helped improve SuggestPilot!

<!-- CONTRIBUTORS-START -->
<table>
  <tr>
    <td align="center">
      <a href="https://github.com/Shantanugupta43">
        <img src="https://avatars.githubusercontent.com/u/99300527?v=4" width="80px;" alt="Shantanugupta43"/><br />
        <sub><b>@Shantanugupta43</b></sub><br />
        <sub>22 PRs merged</sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/terminalchai">
        <img src="https://avatars.githubusercontent.com/u/213856599?v=4" width="80px;" alt="terminalchai"/><br />
        <sub><b>@terminalchai</b></sub><br />
        <sub>2 PRs merged</sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/raido5">
        <img src="https://avatars.githubusercontent.com/u/169839918?v=4" width="80px;" alt="raido5"/><br />
        <sub><b>@raido5</b></sub><br />
        <sub>1 PR merged</sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/mira-craft">
        <img src="https://avatars.githubusercontent.com/u/181084618?v=4" width="80px;" alt="mira-craft"/><br />
        <sub><b>@mira-craft</b></sub><br />
        <sub>1 PR merged</sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/Utkarsh-rwt">
        <img src="https://avatars.githubusercontent.com/u/241274883?v=4" width="80px;" alt="Utkarsh-rwt"/><br />
        <sub><b>@Utkarsh-rwt</b></sub><br />
        <sub>1 PR merged</sub>
      </a>
    </td>
  </tr>
</table>
<!-- CONTRIBUTORS-END -->



https://github.com/user-attachments/assets/7f69d30d-5a3a-4de2-8855-96cf82afd425




## What It Does

Most autocomplete tools look at the word you're typing. This one looks at *you* — what you've been researching for the last 30 minutes, what tabs you have open, what page you're on everything locally on your browser, never sharing with any third parties.


## Getting Started

### 1. Get a Free Groq API Key

Sign up at **[console.groq.com/keys](https://console.groq.com/keys)** — no credit card required. Groq's free tier is generous and more than enough for personal use.

### 2. Install the Extension

**From source (Chrome):**

```bash
git clone https://github.com/Shantanugupta43/SuggestPilot.git
cd SuggestPilot
```

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked** and select the cloned folder
4. The extension icon appears in your toolbar

### 3. Configure

Click the extension icon → **Configure Settings** → paste your Groq API key → **Save Settings**.

Hit **Test Connection** after save settings to confirm everything's working.

## How It Works

### Suggestion Generation

When you pause typing (500ms debounce), the content script sends a message to the service worker with:
- The current input value
- The page type (AI chat / coding / search / general)
- Form field metadata (field type, nearby label text, local candidates)

The service worker assembles a context object from:
- **Session intent** — the extracted research thread from `session-tracker.js`
- **Open tabs** — titles of other tabs in the current window (excluding sensitive domains)
- **Recent history** — last 2 hours of browsing, filtered for useful titles

This gets packed into a tight token-efficient prompt and sent to Groq's `llama-3.1-8b-instant` model. The response is parsed and returned as 3 ranked suggestions.

### Session Tracking

`session-tracker.js` maintains a rolling window of up to 20 recent queries in `chrome.storage.local`. After each generation, it:
1. Pushes the new query into the session
2. Extracts dominant topics via word/bigram frequency (filtering stopwords)
3. Builds a short summary string like `"Researching: python async, asyncio, concurrency"`

This summary is prepended to every subsequent prompt as `SESSION:` and `THREAD:` context. Sessions expire after 30 minutes of inactivity.

### Form Fill

`form-detector.js` classifies the focused input by combining `name`, `id`, `placeholder`, `autocomplete`, `aria-label`, and `type` attributes against 18 semantic field patterns. For deterministic fields (OS, browser, issue description), it builds candidates locally from `navigator.userAgent` — no API call. For professional fields (job title, company, LinkedIn URL), it scans open tabs for matching domains and extracts values from page titles.

If local candidates are available, they're returned directly without hitting the API. If the field type is recognised but no local candidates exist, the field type is included in the Groq prompt so the model can generate context-appropriate suggestions.

### Prompt Design

The prompt is deliberately minimal to stay within token budget and maximise inference speed:

```
Q:"python async"
SESSION:Researching: python async, asyncio, concurrency
THREAD:python performance → asyncio event loop → python async
TABS:"Asyncio — Python 3.12 docs", "Stack Overflow: asyncio vs threads"
HIST:"Real Python — Async IO", "Python concurrency guide"

```

The system prompt instructs the model to produce 3 completions as structured JSON — suggestion[0] continuing the session thread, suggestion[1] from tabs/history context, suggestion[2] flexible.


# Blocked Domains

The extension is silently disabled on certain sites. Currently:

```js
// content-script.js
const BLOCKED_DOMAINS = [
  'linkedin.com'
];
```

To add more, edit this array. The extension still *reads* LinkedIn tabs as context when you're on other sites (e.g. to pull your job title for form filling) — it just won't show suggestions while you're *on* LinkedIn.

If you have a suggestion or want to blacklist more domains. Flag it on issues tab with the reason of blacklist and why?

## Privacy

- **No data leaves your browser** except the minimal prompt sent to Groq for inference
- **No analytics, no tracking, no external servers** beyond the Groq API
- Browsing history is read locally and never stored outside `chrome.storage.local`
- Sensitive fields (password, credit card, CVV, SSN, bank, PIN, OTP, tokens) are silently skipped — the overlay never appears on them
- Session data is stored locally and auto-expires after 30 minutes of inactivity
- All data is cleared when you click **Clear All Data** in settings

The Groq API prompt contains tab titles and recent page titles from your browser. If you're concerned about this, you can disable **Tab Analysis** and **History Tracking** in settings — suggestions will still work but will be less contextual.


## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## Acknowledgements

- [Groq](https://groq.com) for the free, fast inference API
- [Meta / Llama](https://llama.meta.com) for the open-weight model powering suggestions
