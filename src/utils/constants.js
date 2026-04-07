/**
 * Shared Constants
 * Centralized configuration for magic numbers used across the extension.
 * All values are named exports — import only what you need.
 *
 * @module constants
 */

// ── Timing ───────────────────────────────────────────────────────────────────
export const DEBOUNCE_MS = 500;
export const ADDRESS_BAR_DEBOUNCE_MS = 400;
export const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const SUMMARY_REBUILD_INTERVAL = 5;

// Limits
export const MAX_SUGGESTIONS = 3;
export const MAX_QUERIES = 20;
export const MAX_PAST_SEARCHES = 50;
export const MAX_ACTIVE_TABS = 5;
export const MAX_HISTORY_RESULTS = 15;
export const MAX_TOP_VISITED = 5;
export const MAX_AI_TABS = 3;
export const MAX_RECENT_THREAD = 5;
export const MAX_THREAD_TEXT_LENGTH = 120;
export const MAX_TAB_TITLE_SLICE = 40;
export const MAX_HEADING_COUNT = 3;

// API
export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const GROQ_MODEL = 'llama-3.1-8b-instant';
export const MAX_TOKENS = 200;
export const TEMPERATURE = 0.4;
export const TOP_P = 0.9;
export const TEST_MAX_TOKENS = 20;
export const TEST_TEMPERATURE = 0;

// Defaults (config-manager)
export const DEFAULT_MAX_TOKENS = 150;
export const DEFAULT_TEMPERATURE = 0.3;

// Suggestion validation
export const MIN_SUGGESTION_LENGTH = 3;
export const MAX_SUGGESTION_LENGTH = 200;

// UI
export const SUGGESTION_MIN_INPUT_LENGTH = 1;
export const SUGGESTION_FOCUSOUT_DELAY = 200;
export const STATUS_MESSAGE_TIMEOUT = 5000;
export const SETTINGS_VIEW_DELAY = 1000;
export const LOADING_TIMEOUT = 15000; // 15 seconds

// Prompt building
export const PROMPT_TAB_COUNT = 2;
export const PROMPT_HISTORY_COUNT = 2;
export const PROMPT_TITLE_SLICE = 40;
export const PROMPT_PAGE_TITLE_SLICE = 80;

// Session / storage
export const MAX_CANDIDATE_SLICE = 3;
export const MAX_FIELD_HEADING_SLICE = 5;

// Default blocked domains — banking, healthcare, government, password managers
export const DEFAULT_BLOCKED_DOMAINS = [
  // General
  'linkedin.com',
  // Banking
  'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citibank.com',
  'capitalone.com', 'usbank.com', 'pnc.com',
  // Healthcare
  'mychart.com', 'kp.org', 'cerner.com', 'followmyhealth.com',
  // Government
  'ssa.gov', 'irs.gov', 'uscis.gov', 'va.gov',
  // Password managers
  'lastpass.com', '1password.com', 'my.1password.com', 'dashlane.com', 'bitwarden.com'
];
