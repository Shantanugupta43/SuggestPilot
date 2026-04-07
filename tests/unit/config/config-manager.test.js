/**
 * Unit tests — ConfigManager
 * src/config/config-manager.js
 *
 * ConfigManager is a singleton that wraps chrome.storage.local.
 * The chrome mock (tests/setup/chrome-mock.js) provides the storage stub,
 * and __resetChromeMocks() / __seedStorage() helpers control state.
 *
 * Because config-manager exports a singleton we re-import (or reset) it
 * for each test that needs a clean state.
 */

// Re-import the singleton fresh for each test via jest module isolation
// We use jest.isolateModules so each test block gets a new instance.

describe('ConfigManager', () => {
  let configManager;

  // Grab a fresh singleton before each test
  beforeEach(async () => {
    jest.resetModules();
    const mod = await import('../../../src/config/config-manager.js');
    configManager = mod.default;
  });

  // ── initialize ─────────────────────────────────────────────────────────────

  describe('initialize()', () => {
    it('loads config with defaults when storage is empty', async () => {
      await configManager.initialize();
      expect(configManager.get('model')).toBe('llama-3.1-8b-instant');
      expect(configManager.get('maxTokens')).toBe(150);
      expect(configManager.get('temperature')).toBe(0.3);
      expect(configManager.get('enableHistoryTracking')).toBe(true);
    });

    it('reads groqApiKey from storage if present', async () => {
      __seedStorage({ groqApiKey: 'gsk_testkey123' });
      await configManager.initialize();
      expect(configManager.get('groqApiKey')).toBe('gsk_testkey123');
    });

    it('is idempotent — does not re-query storage on second call', async () => {
      await configManager.initialize();
      await configManager.initialize();
      expect(chrome.storage.local.get).toHaveBeenCalledTimes(1);
    });

    it('throws when chrome.storage.local.get rejects', async () => {
      chrome.storage.local.get.mockRejectedValueOnce(new Error('storage error'));
      await expect(configManager.initialize()).rejects.toThrow(
        'Configuration initialization failed'
      );
    });
  });

  // ── getApiKey ──────────────────────────────────────────────────────────────

  describe('getApiKey()', () => {
    it('returns the stored API key after initialization', async () => {
      __seedStorage({ groqApiKey: 'gsk_validkey' });
      await configManager.initialize();
      expect(configManager.getApiKey()).toBe('gsk_validkey');
    });

    it('throws when no API key is configured', async () => {
      await configManager.initialize();
      expect(() => configManager.getApiKey()).toThrow('Groq API key not configured');
    });
  });

  // ── setApiKey ──────────────────────────────────────────────────────────────

  describe('setApiKey()', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('persists a valid key to storage', async () => {
      await configManager.setApiKey('gsk_newkey');
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ groqApiKey: 'gsk_newkey' })
      );
    });

    it('updates the in-memory config', async () => {
      await configManager.setApiKey('gsk_inmem');
      expect(configManager.getApiKey()).toBe('gsk_inmem');
    });

    it('rejects a non-string value', async () => {
      await expect(configManager.setApiKey(null)).rejects.toThrow('Invalid API key');
      await expect(configManager.setApiKey(42)).rejects.toThrow('Invalid API key');
    });

    it('rejects a key that does not start with gsk_', async () => {
      await expect(configManager.setApiKey('sk_notgroq')).rejects.toThrow('Invalid format');
    });
  });

  // ── isConfigured ──────────────────────────────────────────────────────────

  describe('isConfigured()', () => {
    it('returns false when no API key is set', async () => {
      await configManager.initialize();
      expect(configManager.isConfigured()).toBe(false);
    });

    it('returns true when an API key is set', async () => {
      __seedStorage({ groqApiKey: 'gsk_key' });
      await configManager.initialize();
      expect(configManager.isConfigured()).toBe(true);
    });
  });

  // ── isSensitiveField ──────────────────────────────────────────────────────

  describe('isSensitiveField()', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('returns true for "password"', () => {
      expect(configManager.isSensitiveField('password')).toBe(true);
    });

    it('returns true for hyphenated variants like "api-key"', () => {
      expect(configManager.isSensitiveField('api-key')).toBe(true);
    });

    it('returns true for camelCase variant like "creditCard"', () => {
      expect(configManager.isSensitiveField('creditCard')).toBe(true);
    });

    it('returns false for a benign field like "firstName"', () => {
      expect(configManager.isSensitiveField('firstName')).toBe(false);
    });

    it('returns false for a null / empty value', () => {
      expect(configManager.isSensitiveField(null)).toBe(false);
      expect(configManager.isSensitiveField('')).toBe(false);
    });
  });

  // ── get / update ──────────────────────────────────────────────────────────

  describe('get() and update()', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('get() returns a default when key does not exist', () => {
      expect(configManager.get('nonExistentKey', 'fallback')).toBe('fallback');
    });

    it('update() merges new values and persists them', async () => {
      await configManager.update({ debugMode: true, maxTokens: 200 });
      expect(configManager.get('debugMode')).toBe(true);
      expect(configManager.get('maxTokens')).toBe(200);
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  // ── clear ─────────────────────────────────────────────────────────────────

  describe('clear()', () => {
    it('resets initialized flag so next call re-reads storage', async () => {
      await configManager.initialize();
      await configManager.clear();
      expect(configManager.initialized).toBe(false);
      expect(configManager.config).toBeNull();
    });
  });
});
