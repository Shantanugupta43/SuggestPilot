# Contributing to SuggestPilot

Contributions are welcome! Here are a few areas that would make a meaningful difference:

- **More form field types** — `form-detector.js` currently handles 18 patterns. Expanding coverage for more field types (education, languages, pronouns, timezone) would improve the form-fill feature significantly.
- **Blocked domains list** — a community-maintained list of sites where suggestions are unwanted or intrusive would be useful.
- **Better LinkedIn tab parsing** — job title and company extraction from LinkedIn page titles is heuristic and fragile. Better selectors or a more robust parsing strategy would help.
- **Firefox support** — the extension uses Chrome-specific APIs (`chrome.history`, `chrome.tabs`). A Firefox-compatible manifest v2 port would broaden reach.
- **Tests** — there are none. Unit tests for `session-tracker.js`, `form-detector.js`, and `groq-service.js` parsing logic would be a good place to start.

For blocked-domain suggestions, please open an issue explaining why the site should be blacklisted.

---

## Contribution Workflow

To contribute code, please follow this workflow.

### 1. Fork the repository

Click **Fork** on GitHub to create your own copy of the repository.

### 2. Clone your fork

```bash
git clone https://github.com/YOUR-USERNAME/SuggestPilot.git
cd SuggestPilot
```

### 3. Create a new branch

Always create a new branch from `main`. Never commit directly to `main`.

```bash
git checkout -b feature/short-description
```

Examples:

- `feature/add-timezone-field`
- `fix/session-expiry-logic`
- `refactor/prompt-builder`
- `docs/improve-readme`

Keep branches small and focused on one change.

### 4. Make your changes

Before submitting:

- Test locally via `chrome://extensions`
- Ensure there are no console errors
- Confirm suggestions still return valid JSON
- Make sure typing latency is not degraded
- Verify no sensitive fields are exposed

### 5. Commit clearly

Use clear, descriptive commit messages.

### 6. Push your branch

```bash
git push origin feature/short-description
```

### 7. Open a pull request

Go to your fork on GitHub and click **Compare & pull request**.

If changes are requested, update your branch and push again — the PR will update automatically.
