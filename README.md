# AI Context Assistant

**A Chrome extension that generates intelligent, context-aware autocomplete suggestions as you type — powered by Groq's free LLM API.**

Instead of generic autocomplete, it reads what tabs you have open, your recent browsing history, and your current research thread to suggest completions that actually make sense for what you're doing right now.




## What It Does

Most autocomplete tools look at the word you're typing. This one looks at *you* — what you've been researching for the last 30 minutes, what tabs you have open, what page you're on.


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

Pull requests are welcome. A few areas that would make a meaningful difference:

- **More form field types** — `form-detector.js` currently handles 18 patterns. Expanding coverage for more field types (education, languages, pronouns, timezone) would improve the form-fill feature significantly.
- **Blocked domains list** — a community-maintained list of sites where suggestions are unwanted or intrusive would be useful.
- **Better LinkedIn tab parsing** — job title and company extraction from LinkedIn page titles is heuristic and fragile. Better selectors or a more robust parsing strategy would help.
- **Firefox support** — the extension uses Chrome-specific APIs (`chrome.history`, `chrome.tabs`). A Firefox-compatible manifest v2 port would broaden reach.
- **Tests** — there are none. Unit tests for `session-tracker.js`, `form-detector.js`, and `groq-service.js` parsing logic would be a good place to start.

## Acknowledgements

- [Groq](https://groq.com) for the free, fast inference API
- [Meta / Llama](https://llama.meta.com) for the open-weight model powering suggestions