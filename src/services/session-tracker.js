/**
 * Background Service Worker - Groq Cloud Edition
 * + Session Intent Tracking
 * + Smart Form-Fill Suggestions
 */

import configManager from '../config/config-manager.js';
import groqService from '../services/groq-service.js';
import contextCollector from '../services/context-collector.js';
import sessionTracker from '../services/session-tracker.js';

chrome.runtime.onInstalled.addListener(async () => {
  console.log('AI Context Assistant installed');
  await configManager.initialize();
  chrome.action.setBadgeText({ text: '' });
  chrome.action.setBadgeBackgroundColor({ color: '#4A90E2' });
});

chrome.runtime.onStartup.addListener(async () => {
  await configManager.initialize();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender)
    .then(sendResponse)
    .catch(error => {
      console.error('Message error:', error);
      sendResponse({ success: false, error: error.message });
    });
  return true;
});

async function handleMessage(request, sender) {
  const { action, data } = request;

  switch (action) {
    case 'generateSuggestions':
      return await generateSuggestions(data);

    case 'getConfig':
      await configManager.initialize();
      return {
        success: true,
        config: {
          isConfigured: configManager.isConfigured(),
          model: configManager.get('model'),
          enableHistoryTracking: configManager.get('enableHistoryTracking'),
          enableTabAnalysis: configManager.get('enableTabAnalysis'),
          enableAiChatMode: configManager.get('enableAiChatMode')
        }
      };

    case 'setApiKey':
      await configManager.initialize();
      await configManager.setApiKey(data.apiKey);
      return { success: true };

    case 'updateConfig':
      await configManager.initialize();
      await configManager.update(data.updates);
      return { success: true };

    case 'testConnection':
      await configManager.initialize();
      const isConnected = await groqService.testConnection();
      return { success: isConnected };

    case 'clearConfig':
      await configManager.clear();
      await sessionTracker.clearSession();
      return { success: true };

    case 'getSessionIntent':
      return { success: true, intent: await sessionTracker.getIntentContext() };

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function generateSuggestions(data) {
  try {
    // Check if extension is enabled
    const stored = await chrome.storage.local.get('extensionEnabled');
    const extensionEnabled = stored.extensionEnabled ?? true;

    if (!extensionEnabled) {
      return { success: true, reason: 'Extension is disabled', suggestions: [] };
    }

    if (!configManager.initialized) {
      await configManager.initialize();
    }

    if (!configManager.isConfigured()) {
      return { success: false, error: 'Groq API key not configured', suggestions: [] };
    }

    const fullContext = await contextCollector.collectContext();

    const mergedContext = {
      ...fullContext,
      active_input_text: data.context?.active_input_text || fullContext.active_input_text,
      page_type: data.context?.page_type || fullContext.page_type,
      current_page: { ...fullContext.current_page, ...(data.context?.current_page || {}) },
      // ── New: form field metadata from content script ─────────────────────
      fieldMeta: data.fieldMeta || null,
      // ── New: session intent thread ───────────────────────────────────────
      sessionIntent: await sessionTracker.getIntentContext()
    };

    if (mergedContext.active_input_text && data.fieldName) {
      if (contextCollector.isSensitiveInput(mergedContext.active_input_text, data.fieldName)) {
        return { success: true, reason: 'Sensitive input detected', suggestions: [] };
      }
    }

    const result = await groqService.generateSuggestions(mergedContext);

    // Record the query into the session tracker AFTER generating suggestions
    if (mergedContext.active_input_text) {
      await sessionTracker.recordQuery(mergedContext.active_input_text, result.suggestions);
    }

    if (configManager.get('enableHistoryTracking') && mergedContext.active_input_text) {
      await storePastSearch(mergedContext.active_input_text, result.suggestions);
    }

    return { success: true, ...result };
  } catch (error) {
    console.error('Error:', error);
    return { success: false, error: error.message, suggestions: [] };
  }
}

async function storePastSearch(query, suggestions) {
  try {
    const stored = await chrome.storage.local.get('pastSearches');
    const pastSearches = stored.pastSearches || [];
    pastSearches.unshift({ query, suggestions, timestamp: Date.now() });
    await chrome.storage.local.set({ pastSearches: pastSearches.slice(0, 50) });
  } catch (error) {
    console.error('Storage error:', error);
  }
}

console.log('Service worker loaded - Groq Cloud Edition + Session Tracking + Form Fill');