/**
 * Popup Script
 * Handles UI interactions and communication with background script
 */

// Views
const views = {
  notConfigured: document.getElementById('notConfiguredView'),
  main: document.getElementById('mainView'),
  settings: document.getElementById('settingsView')
};

// Elements
const elements = {
  // Main view
  statusBar: document.getElementById('statusBar'),
  statusText: document.getElementById('statusText'),
  loadingState: document.getElementById('loadingState'),
  emptyState: document.getElementById('emptyState'),
  suggestionsList: document.getElementById('suggestionsList'),
  refreshBtn: document.getElementById('refreshBtn'),
  
  // Toggle
  extensionToggle: document.getElementById('extensionToggle'),
  toggleStatus: document.getElementById('toggleStatus'),
  
  // Settings view
  settingsBtn: document.getElementById('settingsBtn'),
  backBtn: document.getElementById('backBtn'),
  goToSettingsBtn: document.getElementById('goToSettingsBtn'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  toggleApiKeyBtn: document.getElementById('toggleApiKeyBtn'),
  modelSelect: document.getElementById('modelSelect'),
  testConnectionBtn: document.getElementById('testConnectionBtn'),
  connectionStatus: document.getElementById('connectionStatus'),
  enableHistoryTracking: document.getElementById('enableHistoryTracking'),
  enableTabAnalysis: document.getElementById('enableTabAnalysis'),
  enableAiChatMode: document.getElementById('enableAiChatMode'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  clearDataBtn: document.getElementById('clearDataBtn')
};

// State
let currentConfig = null;
let currentSuggestions = null;
let extensionEnabled = true;

/**
 * Initialize popup
 */
async function initialize() {
  await loadConfig();
  await loadExtensionState();
  setupEventListeners();
  
  if (currentConfig.isConfigured) {
    showView('main');
    if (extensionEnabled) {
      await loadSuggestions();
    } else {
      showDisabledState();
    }
  } else {
    showView('notConfigured');
  }
}

/**
 * Load configuration
 */
async function loadConfig() {
  try {
    const response = await chrome.runtime.sendMessage({ 
      action: 'getConfig' 
    });
    
    if (response.success) {
      currentConfig = response.config;
      populateSettings();
    }
  } catch (error) {
    console.error('Failed to load config:', error);
    showStatus('Failed to load configuration', 'error');
  }
}

/**
 * Load extension enabled state
 */
async function loadExtensionState() {
  try {
    const stored = await chrome.storage.local.get('extensionEnabled');
    extensionEnabled = stored.extensionEnabled ?? true;
    elements.extensionToggle.checked = extensionEnabled;
    updateToggleStatus();
  } catch (error) {
    console.error('Failed to load extension state:', error);
  }
}

/**
 * Show specific view
 */
function showView(viewName) {
  Object.values(views).forEach(view => view.classList.add('hidden'));
  views[viewName]?.classList.remove('hidden');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Navigation
  elements.settingsBtn.addEventListener('click', () => showView('settings'));
  elements.backBtn.addEventListener('click', () => showView('main'));
  elements.goToSettingsBtn.addEventListener('click', () => showView('settings'));
  
  // Extension Toggle
  elements.extensionToggle.addEventListener('change', toggleExtension);
  
  // Actions
  elements.refreshBtn.addEventListener('click', loadSuggestions);
  elements.toggleApiKeyBtn.addEventListener('click', toggleApiKeyVisibility);
  elements.testConnectionBtn.addEventListener('click', testConnection);
  elements.saveSettingsBtn.addEventListener('click', saveSettings);
  elements.clearDataBtn.addEventListener('click', clearData);
}

/**
 * Load suggestions
 */
async function loadSuggestions() {
  try {
    showLoading();
    
    const response = await chrome.runtime.sendMessage({ 
      action: 'generateSuggestions',
      data: {}
    });
    
    if (response.success) {
      currentSuggestions = response;
      displaySuggestions(response);
    } else {
      showStatus(response.error || 'Failed to generate suggestions', 'error');
      showEmpty();
    }
  } catch (error) {
    console.error('Failed to load suggestions:', error);
    showStatus('Failed to load suggestions', 'error');
    showEmpty();
  }
}

/**
 * Display suggestions
 */
function displaySuggestions(data) {
  const { reason, suggestions } = data;
  
  elements.loadingState.classList.add('hidden');
  elements.emptyState.classList.add('hidden');
  
  if (!suggestions || suggestions.length === 0) {
    showEmpty();
    if (reason) {
      showStatus(reason, 'info');
    }
    return;
  }
  
  elements.suggestionsList.classList.remove('hidden');
  elements.suggestionsList.innerHTML = '';
  
  suggestions.forEach((suggestion, index) => {
    const card = createSuggestionCard(suggestion, index);
    elements.suggestionsList.appendChild(card);
  });
  
  if (reason) {
    showStatus(reason, 'success');
  }
}

/**
 * Create suggestion card
 */
function createSuggestionCard(suggestion, index) {
  const card = document.createElement('div');
  card.className = 'suggestion-card';
  
  // Handle both string and object formats
  const text = typeof suggestion === 'string' ? suggestion : suggestion.text;
  const derivation = typeof suggestion === 'object' ? suggestion.derivation : null;
  
  const textEl = document.createElement('div');
  textEl.className = 'suggestion-text';
  textEl.textContent = text;
  
  card.appendChild(textEl);
  
  // Add derivation explanation if available
  if (derivation) {
    const derivationEl = document.createElement('div');
    derivationEl.className = 'suggestion-derivation';
    derivationEl.innerHTML = `<strong>Why:</strong> ${derivation}`;
    card.appendChild(derivationEl);
  }
  
  // Add click handler to insert suggestion
  card.addEventListener('click', () => insertSuggestion(text));
  
  return card;
}

/**
 * Insert suggestion into active input
 */
async function insertSuggestion(text) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'insertSuggestion',
      data: { text }
    });
    
    if (response.success) {
      showStatus('Suggestion inserted', 'success');
      setTimeout(() => window.close(), 1000);
    } else {
      showStatus('Failed to insert suggestion', 'error');
    }
  } catch (error) {
    console.error('Failed to insert suggestion:', error);
    showStatus('Failed to insert suggestion', 'error');
  }
}

/**
 * Show loading state
 */
function showLoading() {
  elements.loadingState.classList.remove('hidden');
  elements.emptyState.classList.add('hidden');
  elements.suggestionsList.classList.add('hidden');
}

/**
 * Show empty state
 */
function showEmpty() {
  elements.loadingState.classList.add('hidden');
  elements.emptyState.classList.remove('hidden');
  elements.suggestionsList.classList.add('hidden');
}

/**
 * Show disabled state
 */
function showDisabledState() {
  elements.loadingState.classList.add('hidden');
  elements.suggestionsList.classList.add('hidden');
  elements.emptyState.classList.remove('hidden');
  
  const emptyState = elements.emptyState;
  emptyState.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
    </svg>
    <h2>Extension Disabled</h2>
    <p>Toggle the switch in the header to enable AI suggestions</p>
  `;
}

/**
 * Toggle extension on/off
 */
async function toggleExtension() {
  extensionEnabled = elements.extensionToggle.checked;
  
  try {
    await chrome.storage.local.set({ extensionEnabled });
    updateToggleStatus();
    
    // Notify content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, {
      action: 'toggleExtension',
      data: { enabled: extensionEnabled }
    }).catch(() => {});
    
    if (extensionEnabled) {
      showStatus('Extension enabled', 'success');
      await loadSuggestions();
    } else {
      showStatus('Extension disabled', 'info');
      showDisabledState();
    }
  } catch (error) {
    console.error('Failed to toggle extension:', error);
    showStatus('Failed to toggle extension', 'error');
  }
}

/**
 * Update toggle status text
 */
function updateToggleStatus() {
  elements.toggleStatus.textContent = extensionEnabled ? 'ON' : 'OFF';
  elements.toggleStatus.style.color = extensionEnabled ? 'var(--success)' : 'var(--secondary)';
}

/**
 * Show status message
 */
function showStatus(message, type = 'info') {
  elements.statusText.textContent = message;
  elements.statusBar.className = `status-bar ${type}`;
  elements.statusBar.classList.remove('hidden');
  
  setTimeout(() => {
    elements.statusBar.classList.add('hidden');
  }, 5000);
}

/**
 * Populate settings from config
 */
function populateSettings() {
  if (!currentConfig) return;
  
  elements.modelSelect.value = currentConfig.model || 'llama-3.1-8b-instant';
  elements.enableHistoryTracking.checked = currentConfig.enableHistoryTracking ?? true;
  elements.enableTabAnalysis.checked = currentConfig.enableTabAnalysis ?? true;
  elements.enableAiChatMode.checked = currentConfig.enableAiChatMode ?? true;
}

/**
 * Toggle API key visibility
 */
function toggleApiKeyVisibility() {
  const input = elements.apiKeyInput;
  input.type = input.type === 'password' ? 'text' : 'password';
}

/**
 * Test API connection
 */
async function testConnection() {
  try {
    elements.testConnectionBtn.disabled = true;
    elements.testConnectionBtn.textContent = 'Testing...';
    elements.connectionStatus.classList.add('hidden');
    
    const response = await chrome.runtime.sendMessage({ 
      action: 'testConnection' 
    });
    
    elements.connectionStatus.classList.remove('hidden');
    
    if (response.success) {
      elements.connectionStatus.textContent = 'âœ“ Connection successful';
      elements.connectionStatus.className = 'connection-status success';
    } else {
      elements.connectionStatus.textContent = 'âœ— Connection failed';
      elements.connectionStatus.className = 'connection-status error';
    }
  } catch (error) {
    elements.connectionStatus.classList.remove('hidden');
    elements.connectionStatus.textContent = 'âœ— Connection failed: ' + error.message;
    elements.connectionStatus.className = 'connection-status error';
  } finally {
    elements.testConnectionBtn.disabled = false;
    elements.testConnectionBtn.textContent = 'Test Connection';
  }
}

/**
 * Save settings
 */
async function saveSettings() {
  try {
    elements.saveSettingsBtn.disabled = true;
    elements.saveSettingsBtn.textContent = 'Saving...';
    
    // Save API key if provided
    const apiKey = elements.apiKeyInput.value.trim();
    if (apiKey) {
      await chrome.runtime.sendMessage({
        action: 'setApiKey',
        data: { apiKey }
      });
      elements.apiKeyInput.value = '';
    }
    
    // Save other settings
    await chrome.runtime.sendMessage({
      action: 'updateConfig',
      data: {
        updates: {
          model: elements.modelSelect.value,
          enableHistoryTracking: elements.enableHistoryTracking.checked,
          enableTabAnalysis: elements.enableTabAnalysis.checked,
          enableAiChatMode: elements.enableAiChatMode.checked
        }
      }
    });
    
    showStatus('Settings saved successfully', 'success');
    await loadConfig();
    
    if (currentConfig.isConfigured) {
      setTimeout(() => showView('main'), 1000);
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatus('Failed to save settings: ' + error.message, 'error');
  } finally {
    elements.saveSettingsBtn.disabled = false;
    elements.saveSettingsBtn.textContent = 'Save Settings';
  }
}

/**
 * Clear all data
 */
async function clearData() {
  if (!confirm('Are you sure you want to clear all data? This will remove your API key and settings.')) {
    return;
  }
  
  try {
    await chrome.runtime.sendMessage({ 
      action: 'clearConfig' 
    });
    
    showStatus('All data cleared', 'success');
    await loadConfig();
    showView('notConfigured');
  } catch (error) {
    console.error('Failed to clear data:', error);
    showStatus('Failed to clear data', 'error');
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initialize);