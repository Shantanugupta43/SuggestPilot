/**
 * Tests for config-manager.js
 */

import { jest } from '@jest/globals';
import ConfigManager from '../src/config/config-manager.js';
import { resetChromeMocks } from './__mocks__/chrome.js';

describe('ConfigManager', () => {
  beforeEach(() => {
    resetChromeMocks();
    // Reset the singleton
    ConfigManager.config = null;
    ConfigManager.initialized = false;
  });

  describe('initialize', () => {
    it('should set initialized to true', async () => {
      await ConfigManager.initialize();
      expect(ConfigManager.initialized).toBe(true);
    });

    it('should load defaults when no config exists', async () => {
      await ConfigManager.initialize();
      expect(ConfigManager.get('model')).toBe('llama-3.1-8b-instant');
      expect(ConfigManager.get('enableHistoryTracking')).toBe(true);
    });

    it('should not re-initialize if already initialized', async () => {
      await ConfigManager.initialize();
      const firstConfig = ConfigManager.config;
      await ConfigManager.initialize();
      expect(ConfigManager.config).toBe(firstConfig);
    });
  });

  describe('setApiKey', () => {
    it('should reject empty keys', async () => {
      await ConfigManager.initialize();
      await expect(ConfigManager.setApiKey('')).rejects.toThrow();
    });

    it('should reject keys not starting with gsk_', async () => {
      await ConfigManager.initialize();
      await expect(ConfigManager.setApiKey('invalid_key')).rejects.toThrow(/gsk_/);
    });

    it('should accept valid keys', async () => {
      await ConfigManager.initialize();
      await ConfigManager.setApiKey('gsk_abcdef1234567890');
      expect(ConfigManager.getApiKey()).toBe('gsk_abcdef1234567890');
    });

    it('should reject keys that are too short', async () => {
      await ConfigManager.initialize();
      await expect(ConfigManager.setApiKey('gsk_short')).rejects.toThrow(/too short/);
    });
  });

  describe('validateApiKey', () => {
    it('should return valid for proper keys', () => {
      const result = ConfigManager.validateApiKey('gsk_abcdef1234567890');
      expect(result.valid).toBe(true);
    });

    it('should return invalid for empty strings', () => {
      const result = ConfigManager.validateApiKey('');
      expect(result.valid).toBe(false);
    });

    it('should return invalid for wrong prefix', () => {
      const result = ConfigManager.validateApiKey('not_gsk_key');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('gsk_');
    });

    it('should return invalid for short keys', () => {
      const result = ConfigManager.validateApiKey('gsk_short');
      expect(result.valid).toBe(false);
    });
  });

  describe('update (deep merge)', () => {
    it('should preserve existing nested keys', async () => {
      await ConfigManager.initialize();
      await ConfigManager.update({ model: 'new-model' });
      // enableHistoryTracking should still exist after partial update
      expect(ConfigManager.get('enableHistoryTracking')).toBe(true);
      expect(ConfigManager.get('model')).toBe('new-model');
    });
  });

  describe('isConfigured', () => {
    it('should return false when no API key is set', async () => {
      await ConfigManager.initialize();
      expect(ConfigManager.isConfigured()).toBe(false);
    });

    it('should return true after setting an API key', async () => {
      await ConfigManager.initialize();
      await ConfigManager.setApiKey('gsk_abcdef1234567890');
      expect(ConfigManager.isConfigured()).toBe(true);
    });
  });

  describe('clear', () => {
    it('should reset config and initialized flag', async () => {
      await ConfigManager.initialize();
      await ConfigManager.setApiKey('gsk_abcdef1234567890');
      await ConfigManager.clear();
      expect(ConfigManager.config).toBeNull();
      expect(ConfigManager.initialized).toBe(false);
    });
  });
});
