# Privacy Policy — SuggestPilot AI Context Assistant

**Last updated: February 2026**

SuggestPilot is a free, open source Chrome extension. This policy explains what data the extension accesses, how it is used, and what never happens to it.

---

## What Data the Extension Accesses

### Browsing History
The extension reads your recent browsing history (page titles and URLs from the last 2 hours, maximum 15 results) at the moment you type in a text field. This is used transiently to generate more relevant autocomplete suggestions — for example, if you recently visited a Python documentation page, suggestions will reflect that context.

History data is **never stored persistently**, never logged, and never transmitted to any server. It exists in memory only for the duration of a single suggestion request.

### Open Tab Titles and URLs
The extension reads the titles and URLs of other tabs open in your current browser window. This is used solely to understand your current context — for example, if you have a GitHub tab open, suggestions may reflect that. Only titles and URLs are read; **no tab content, text, or page data is accessed**.

### Text You Type
The extension reads the text you are actively typing in the focused input field in order to generate autocomplete completions. This text is included in the request sent to the Groq API (see below).

### Extension Settings
Your Groq API key and extension preferences (model choice, feature toggles) are stored locally in `chrome.storage.local` on your device. They are never transmitted anywhere except your API key, which is sent to Groq's servers solely to authenticate your inference requests.

### Session Intent Thread
A short rolling summary of your recent queries (up to 20 entries) is stored locally in `chrome.storage.local` to improve suggestion continuity across a session. This data expires automatically after 30 minutes of inactivity and is cleared entirely when you use **Clear All Data** in the extension settings.

---

## What Is Sent to External Servers

The only external service this extension communicates with is the **Groq API** (`api.groq.com`).

When you type in a text field, the following is sent to Groq:

- The text you have typed in the current field
- Titles of recently visited pages (last 2 hours)
- Titles of other open tabs
- A short session summary (e.g. "Researching: python async, asyncio")

**Nothing else is sent.** No full page content, no personal information, no keystrokes outside the active input field.

Groq's own privacy policy governs how they handle inference requests: [groq.com/privacy](https://groq.com/privacy)

You provide your own Groq API key. All requests are made directly from your browser to Groq on your behalf — there is no intermediary server operated by this extension.

---

## What the Extension Never Does

- Does not access password fields, credit card fields, PIN fields, OTP fields, or any field identified as sensitive
- Does not collect names, email addresses, or any personally identifiable information
- Does not track clicks, mouse movements, keystrokes outside active input fields, or any behavioural data
- Does not sell, share, or transfer any data to any third party
- Does not use data for advertising, profiling, or any purpose unrelated to generating autocomplete suggestions
- Does not operate any backend server — there is no database, no analytics service, no remote logging
- Does not run on LinkedIn.com or any other domain in the blocked list

---

## Data Storage Summary

| Data | Where stored | How long | Sent externally? |
|---|---|---|---|
| Groq API key | chrome.storage.local | Until cleared | To Groq only (auth) |
| Extension settings | chrome.storage.local | Until cleared | No |
| Session intent thread | chrome.storage.local | 30 min inactivity | To Groq as summary text |
| Recent queries (max 50) | chrome.storage.local | Until cleared | No |
| Tab titles / history | Memory only | Single request | To Groq as context |

---

## Your Control

You can clear all locally stored data at any time: open the extension popup → **Settings** → **Clear All Data**. This removes your API key, settings, session history, and all stored queries.

You can also disable individual features (history tracking, tab analysis) in Settings if you prefer more limited context sharing.

---

## Open Source

This extension is fully open source. Every line of code is publicly available and auditable at:

**[https://github.com/Shantanugupta43/SuggestPilot](https://github.com/Shantanugupta43/SuggestPilot)**

You do not have to trust this policy — you can verify the extension's behaviour directly in the source code.

---

## Changes to This Policy

If this policy changes materially, the **Last updated** date at the top will be updated and a note will be added to the repository's changelog. Continued use of the extension after changes constitutes acceptance.

---

## Contact

If you have questions about this privacy policy, open an issue on the GitHub repository:

[github.com/Shantanugupta43/SuggestPilot/issues](https://github.com/Shantanugupta43/SuggestPilot/issues)
