/**
 * Configuration Manager
 */

import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '../utils/constants.js';

class ConfigManager {
  constructor() {
    this.config = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const stored = await chrome.storage.local.get(['groqApiKey', 'config']);
      
      this.config = {
        groqApiKey: stored.groqApiKey || null,
        model: stored.config?.model || 'llama-3.1-8b-instant',
        maxTokens: stored.config?.maxTokens || DEFAULT_MAX_TOKENS,
        temperature: stored.config?.temperature || DEFAULT_TEMPERATURE,
        enableHistoryTracking: stored.config?.enableHistoryTracking ?? true,
        enableTabAnalysis: stored.config?.enableTabAnalysis ?? true,
        enableAiChatMode: stored.config?.enableAiChatMode ?? true,
        debugMode: stored.config?.debugMode || false,
        blockedSensitiveFields: stored.config?.blockedSensitiveFields || [
          'password', 'passwd', 'pwd', 'credit-card', 'creditcard', 'ssn', 'bank', 'pin', 'cvv', 'api-key', 'token'
        ]
      };

      this.initialized = true;
    } catch (error) {
      console.error('Config initialization failed:', error);
      throw new Error('Configuration initialization failed');
    }
  }

  getApiKey() {
    if (!this.config?.groqApiKey) {
      throw new Error('Groq API key not configured');
    }
    return this.config.groqApiKey;
  }

  validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return { valid: false, error: 'Invalid API key' };
    }
    if (!apiKey.startsWith('gsk_')) {
      return { valid: false, error: 'Invalid format. Groq API keys start with "gsk_"' };
    }
    if (apiKey.length < 10) {
      return { valid: false, error: 'API key is too short' };
    }
    return { valid: true };
  }

  async setApiKey(apiKey) {
    const validation = this.validateApiKey(apiKey);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    await chrome.storage.local.set({ groqApiKey: apiKey });
    this.config.groqApiKey = apiKey;
  }

  get(key, defaultValue = null) {
    return this.config?.[key] ?? defaultValue;
  }

  async update(updates) {
    const currentConfig = await chrome.storage.local.get('config');
    const newConfig = this._deepMerge(currentConfig.config || {}, updates);
    await chrome.storage.local.set({ config: newConfig });
    this.config = this._deepMerge(this.config || {}, updates);
  }

  /**
   * Recursively merge source into target, preserving nested keys not in source.
   */
  _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        result[key] = this._deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  isConfigured() {
    return Boolean(this.config?.groqApiKey);
  }

  isSensitiveField(fieldName) {
    if (!fieldName) return false;
    const normalized = fieldName.toLowerCase().replace(/[_\s-]/g, '');
    const blockedFields = this.config.blockedSensitiveFields.map(f => f.toLowerCase().replace(/[_\s-]/g, ''));
    return blockedFields.some(blocked => normalized.includes(blocked));
  }

  async clear() {
    await chrome.storage.local.remove(['config', 'groqApiKey', 'sessionIntent', 'pastSearches', 'extensionEnabled']);
    this.config = null;
    this.initialized = false;
  }
}

const configManager = new ConfigManager();
export default configManager;