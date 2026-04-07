/**
 * Configuration Manager
 * Handles storage, validation, and retrieval of extension settings.
 * All config is persisted to chrome.storage.local.
 *
 * @typedef {Object} Config
 * @property {string|null} groqApiKey - Groq API key
 * @property {string} model - Groq model identifier
 * @property {number} maxTokens - Max tokens per API request
 * @property {number} temperature - AI generation temperature
 * @property {boolean} enableHistoryTracking - Whether to store recent searches
 * @property {boolean} enableTabAnalysis - Whether to analyze open tabs
 * @property {boolean} enableAiChatMode - Whether to enable AI chat mode
 * @property {boolean} debugMode - Debug logging toggle
 * @property {string[]} blockedSensitiveFields - Patterns for sensitive field detection
 * @property {string[]} blockedDomains - Domains where suggestions are disabled
 */

import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, DEFAULT_BLOCKED_DOMAINS } from '../utils/constants.js';

/**
 * Manages extension configuration with validation and deep merge support.
 */
class ConfigManager {
  constructor() {
    /** @type {Config|null} */
    this.config = null;
    /** @type {boolean} */
    this.initialized = false;
  }

  /**
   * Initialize config from chrome.storage.local. Safe to call multiple times.
   * @returns {Promise<void>}
   */
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
        ],
        blockedDomains: stored.config?.blockedDomains || DEFAULT_BLOCKED_DOMAINS
      };

      this.initialized = true;
    } catch (error) {
      console.error('Config initialization failed:', error);
      throw new Error('Configuration initialization failed');
    }
  }

  /**
   * Get the stored Groq API key.
   * @returns {string} The API key
   * @throws {Error} If no API key is configured
   */
  getApiKey() {
    if (!this.config?.groqApiKey) {
      throw new Error('Groq API key not configured');
    }
    return this.config.groqApiKey;
  }

  /**
   * Validate an API key format.
   * @param {string} apiKey - The API key to validate
   * @returns {{ valid: boolean, error?: string }} Validation result
   */
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

  /**
   * Save and validate a Groq API key.
   * @param {string} apiKey - The API key to store
   * @returns {Promise<void>}
   * @throws {Error} If the key format is invalid
   */
  async setApiKey(apiKey) {
    const validation = this.validateApiKey(apiKey);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    await chrome.storage.local.set({ groqApiKey: apiKey });
    this.config.groqApiKey = apiKey;
  }

  /**
   * Get a config value by key.
   * @param {string} key - The config property name
   * @param {*} [defaultValue=null] - Fallback if key is missing
   * @returns {*} The config value or default
   */
  get(key, defaultValue = null) {
    return this.config?.[key] ?? defaultValue;
  }

  /**
   * Apply a partial config update with deep merge.
   * @param {Object} updates - Partial config object to merge
   * @returns {Promise<void>}
   */
  async update(updates) {
    const currentConfig = await chrome.storage.local.get('config');
    const newConfig = this._deepMerge(currentConfig.config || {}, updates);
    await chrome.storage.local.set({ config: newConfig });
    this.config = this._deepMerge(this.config || {}, updates);
  }

  /**
   * Recursively merge source into target, preserving nested keys not in source.
   * @param {Object} target - The base object
   * @param {Object} source - The object to merge in
   * @returns {Object} The merged result
   * @private
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

  /**
   * Check if the extension is configured (API key set).
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(this.config?.groqApiKey);
  }

  /**
   * Check if a field name matches any blocked sensitive pattern.
   * @param {string} fieldName - The field name or attribute to check
   * @returns {boolean} True if the field is sensitive
   */
  isSensitiveField(fieldName) {
    if (!fieldName) return false;
    const normalized = fieldName.toLowerCase().replace(/[_\s-]/g, '');
    const blockedFields = this.config.blockedSensitiveFields.map(f => f.toLowerCase().replace(/[_\s-]/g, ''));
    return blockedFields.some(blocked => normalized.includes(blocked));
  }

  /**
   * Clear all extension-specific data from storage.
   * @returns {Promise<void>}
   */
  async clear() {
    await chrome.storage.local.remove(['config', 'groqApiKey', 'sessionIntent', 'pastSearches', 'extensionEnabled']);
    this.config = null;
    this.initialized = false;
  }

  /**
   * Get the current list of blocked domains.
   * @returns {string[]} Array of domain names
   */
  getBlockedDomains() {
    return this.config?.blockedDomains || DEFAULT_BLOCKED_DOMAINS;
  }

  /**
   * Save a new list of blocked domains.
   * @param {string[]} domains - Array of domain names to block
   * @returns {Promise<string[]>} The cleaned and saved domain list
   * @throws {Error} If domains is not an array
   */
  async setBlockedDomains(domains) {
    if (!Array.isArray(domains)) {
      throw new Error('Blocked domains must be an array');
    }
    const cleaned = domains.map(d => d.toLowerCase().trim()).filter(Boolean);
    await this.update({ blockedDomains: cleaned });
    return cleaned;
  }
}

const configManager = new ConfigManager();
export default configManager;