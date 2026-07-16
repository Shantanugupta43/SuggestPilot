/**
 * Chrome Extension API Mock
 * Provides a minimal, jest-compatible stub of the chrome.* namespace.
 * Installed via jest.config.cjs → setupFiles (runs before the test framework).
 *
 * Design principles:
 *  - Each API method is a jest.fn() so individual tests can assert calls
 *    and override behaviour with mockResolvedValue / mockImplementation.
 *  - Storage is backed by a plain in-memory object so state can be
 *    inspected and reset between tests.
 *  - messageListeners array mirrors real chrome message routing at a
 *    basic level; tests can call dispatchChromeMessage() to simulate
 *    incoming messages.
 */

// ── In-memory storage backend ────────────────────────────────────────────────
const _storage = {};

function _storageMergeGet(keys) {
  if (!keys) return { ..._storage };
  if (typeof keys === 'string') return { [keys]: _storage[keys] };
  if (Array.isArray(keys)) {
    return keys.reduce((acc, k) => ({ ...acc, [k]: _storage[k] }), {});
  }
  // Object with defaults
  return Object.entries(keys).reduce((acc, [k, def]) => {
    acc[k] = k in _storage ? _storage[k] : def;
    return acc;
  }, {});
}

// ── Message listener registry ────────────────────────────────────────────────
const _messageListeners = [];

// ── Runtime error simulation ─────────────────────────────────────────────────
let _lastError = null;

// ── Chrome global ────────────────────────────────────────────────────────────
global.chrome = {
  storage: {
    local: {
      get: jest.fn((keys) =>
        Promise.resolve(_storageMergeGet(keys))
      ),
      set: jest.fn((items) => {
        Object.assign(_storage, items);
        return Promise.resolve();
      }),
      remove: jest.fn((keys) => {
        const toRemove = Array.isArray(keys) ? keys : [keys];
        toRemove.forEach(k => delete _storage[k]);
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        Object.keys(_storage).forEach(k => delete _storage[k]);
        return Promise.resolve();
      })
    }
  },

  tabs: {
    query: jest.fn(() => Promise.resolve([])),
    sendMessage: jest.fn(() => Promise.resolve({})),
    onActivated: { addListener: jest.fn() },
    onUpdated: { addListener: jest.fn() }
  },

  runtime: {
    onMessage: {
      addListener: jest.fn((listener) => _messageListeners.push(listener)),
      removeListener: jest.fn()
    },
    sendMessage: jest.fn(() => Promise.resolve()),
    lastError: null,
    id: 'test-extension-id'
  },

  history: {
    search: jest.fn(() => Promise.resolve([]))
  },

  action: {
    setBadgeText: jest.fn(() => Promise.resolve()),
    setBadgeBackgroundColor: jest.fn(() => Promise.resolve())
  }
};

// ── Test helpers exposed on global ───────────────────────────────────────────

/**
 * Reset all chrome mock state between tests.
 * Call in beforeEach or afterEach.
 */
global.__resetChromeMocks = function () {
  // Clear storage
  Object.keys(_storage).forEach(k => delete _storage[k]);

  // Reset all jest.fn() call history
  chrome.storage.local.get.mockClear();
  chrome.storage.local.set.mockClear();
  chrome.storage.local.remove.mockClear();
  chrome.storage.local.clear.mockClear();

  chrome.tabs.query.mockClear();
  chrome.tabs.sendMessage.mockClear();

  chrome.runtime.onMessage.addListener.mockClear();
  chrome.runtime.sendMessage.mockClear();

  chrome.history.search.mockClear();

  _messageListeners.length = 0;
  _lastError = null;
};

/**
 * Seed the in-memory storage with test data.
 * @param {Object} data - key/value pairs to pre-populate
 */
global.__seedStorage = function (data) {
  Object.assign(_storage, data);
};

/**
 * Simulate an incoming chrome runtime message.
 * @param {any} message
 * @param {Object} [sender]
 */
global.__dispatchChromeMessage = function (message, sender = {}) {
  _messageListeners.forEach(l => l(message, sender, () => {}));
};
