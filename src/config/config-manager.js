/**
 * Configuration Manager
 */

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
        maxTokens: stored.config?.maxTokens || 150,
        temperature: stored.config?.temperature || 0.3,
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

  async setApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('Invalid API key');
    }

    if (!apiKey.startsWith('gsk_')) {
      throw new Error('Invalid format. Groq keys start with "gsk_"');
    }

    await chrome.storage.local.set({ groqApiKey: apiKey });
    this.config.groqApiKey = apiKey;
  }

  get(key, defaultValue = null) {
    return this.config?.[key] ?? defaultValue;
  }

  async update(updates) {
    const currentConfig = await chrome.storage.local.get('config');
    const newConfig = { ...currentConfig.config, ...updates };
    await chrome.storage.local.set({ config: newConfig });
    this.config = { ...this.config, ...updates };
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
    await chrome.storage.local.clear();
    this.config = null;
    this.initialized = false;
  }
}

const configManager = new ConfigManager();
export default configManager;