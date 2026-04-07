/**
 * Context Collector
 * Gathers browsing context from the current page and browser state.
 *
 * @typedef {Object} TabInfo
 * @property {string} title - Tab title
 * @property {string} url - Tab URL
 * @property {number} [visitCount] - Number of visits
 * @property {number} [lastVisitTime] - Last visit timestamp
 * @property {string} [platform] - AI platform name (for AI tabs)
 *
 * @typedef {Object} PageContext
 * @property {string} title - Page title
 * @property {string} url - Page URL
 * @property {string[]} headings - Page headings
 *
 * @typedef {Object} FullContext
 * @property {PageContext} current_page - Current active page info
 * @property {TabInfo[]} active_tabs - Other open tabs
 * @property {string} active_input_text - Current input value
 * @property {TabInfo[]} recent_history - Recent browsing history
 * @property {TabInfo[]} top_visited_titles - Most visited sites
 * @property {TabInfo[]} recent_ai_tabs - Recent AI chat tabs
 * @property {Object} past_similar_searches - Past search history
 * @property {string} page_type - Detected page type
 */

import {
  MAX_ACTIVE_TABS, MAX_HISTORY_RESULTS, MAX_TOP_VISITED,
  MAX_AI_TABS, MAX_HEADING_COUNT
} from '../utils/constants.js';

/**
 * Collects browsing context for suggestion generation.
 */
class ContextCollector {
  /**
   * Collect full context for suggestion generation.
   * @returns {Promise<FullContext>}
   */
  async collectContext() {
    const context = {
      current_page: await this.getCurrentPageContext(),
      active_tabs: await this.getActiveTabsContext(),
      active_input_text: await this.getActiveInputText(),
      recent_history: await this.getRecentHistory(),
      top_visited_titles: await this.getTopVisitedTitles(),
      recent_ai_tabs: await this.getRecentAITabs(),
      past_similar_searches: await this.getPastSimilarSearches(),
      page_type: await this.detectPageType()
    };

    return context;
  }

  /**
   * Get current page context (title, URL, headings).
   * Handles Chrome internal pages gracefully.
   * @returns {Promise<PageContext>}
   */
  async getCurrentPageContext() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Chrome internal pages cannot receive content script messages
      const internalPrefixes = ['chrome://', 'chrome-extension://', 'edge://', 'about:'];
      const isInternalPage = tab.url && internalPrefixes.some(prefix => tab.url.startsWith(prefix));

      if (isInternalPage) {
        return {
          title: tab.title || 'Chrome Internal Page',
          url: tab.url || '',
          headings: []
        };
      }

      const pageInfo = await chrome.tabs.sendMessage(tab.id, {
        action: 'getPageContext'
      }).catch(() => ({
        title: tab.title || '',
        headings: []
      }));

      return {
        title: pageInfo.title || tab.title || '',
        url: tab.url || '',
        headings: (pageInfo.headings || []).slice(0, MAX_HEADING_COUNT)
        // Removed summary and mainContent to save tokens
      };
    } catch (error) {
      console.error('Error getting current page context:', error);
      return { title: '', url: '', headings: [] };
    }
  }

  /**
   * Get up to MAX_ACTIVE_TABS other open tabs (excluding current).
   * Filters out sensitive domains.
   * @returns {Promise<TabInfo[]>}
   */
  async getActiveTabsContext() {
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

      const sensitiveDomains = [
        'bank', 'login', 'signin', 'auth', 'payment',
        'checkout', 'account', 'admin', 'dashboard'
      ];

      const activeTabs = tabs
        .filter(tab => {
          // EXCLUDE the current active tab
          if (tab.id === currentTab?.id) {
            return false;
          }

          const url = tab.url?.toLowerCase() || '';
          const isFiltered = sensitiveDomains.some(domain => url.includes(domain));
          return !isFiltered;
        })
        .slice(0, MAX_ACTIVE_TABS) // Get top 5 OTHER tabs
        .map(tab => ({
          title: tab.title || '',
          url: tab.url || ''
        }));

      return activeTabs;
    } catch (error) {
      console.error('Error getting active tabs:', error);
      return [];
    }
  }

  /**
   * Get active input text from the focused element on the current page.
   * @returns {Promise<string>} The input text or empty string
   */
  async getActiveInputText() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const result = await chrome.tabs.sendMessage(tab.id, { 
        action: 'getActiveInput' 
      }).catch(() => ({ text: '' }));

      return result.text || '';
    } catch (error) {
      console.error('Error getting active input:', error);
      return '';
    }
  }

  /**
   * Get recent browsing history (last 2 hours).
   * @returns {Promise<TabInfo[]>}
   */
  async getRecentHistory() {
    try {
      const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
      const history = await chrome.history.search({
        text: '',
        startTime: twoHoursAgo,
        maxResults: MAX_HISTORY_RESULTS // Reduced for token efficiency
      });

      const filtered = history
        .filter(item => {
          const url = item.url?.toLowerCase() || '';
          const title = item.title?.toLowerCase() || '';
          return !url.includes('chrome://') && 
                 !url.includes('chrome-extension://') &&
                 title && 
                 title !== 'new tab' &&
                 title.length > 3;
        })
        .map(item => ({
          title: item.title || '',
          url: item.url || '',
          visitCount: item.visitCount || 0,
          lastVisitTime: item.lastVisitTime || 0
        }));

      return filtered;
    } catch (error) {
      console.error('Error getting history:', error);
      return [];
    }
  }

  /**
   * Get top 5 most visited sites from the last week.
   * @returns {Promise<TabInfo[]>}
   */
  async getTopVisitedTitles() {
    try {
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const history = await chrome.history.search({
        text: '',
        startTime: oneWeekAgo,
        maxResults: 50 // Top-visited sample size
      });

      const topTitles = history
        .filter(item => {
          const url = item.url?.toLowerCase() || '';
          const title = item.title?.toLowerCase() || '';
          return !url.includes('chrome://') && 
                 !url.includes('chrome-extension://') &&
                 title && 
                 title !== 'new tab' &&
                 title.length > 3 &&
                 item.visitCount > 1;
        })
        .sort((a, b) => b.visitCount - a.visitCount)
        .slice(0, MAX_TOP_VISITED) // Reduced to top 5
        .map(item => ({
          title: item.title || '',
          url: item.url || '',
          visitCount: item.visitCount || 0
        }));

      return topTitles;
    } catch (error) {
      console.error('Error getting top visited titles:', error);
      return [];
    }
  }

  /**
   * Get recent AI chat tabs (last 1 hour).
   * @returns {Promise<TabInfo[]>}
   */
  async getRecentAITabs() {
    try {
      const aiDomains = [
        'chat.openai.com', 'claude.ai', 'bard.google.com',
        'copilot.microsoft.com', 'perplexity.ai', 'gemini.google.com',
        'poe.com', 'huggingface.co/chat'
      ];

      const oneHourAgo = Date.now() - (60 * 60 * 1000); // Reduced to 1 hour
      const history = await chrome.history.search({
        text: '',
        startTime: oneHourAgo,
        maxResults: 20 // AI-tab sample
      });

      const aiTabs = history
        .filter(item => {
          const url = item.url?.toLowerCase() || '';
          return aiDomains.some(domain => url.includes(domain));
        })
        .slice(0, MAX_AI_TABS) // Reduced to 3 for token efficiency
        .map(item => ({
          title: item.title || '',
          url: item.url || '',
          platform: this.detectAIPlatform(item.url || '')
        }));

      return aiTabs;
    } catch (error) {
      console.error('Error getting AI tabs:', error);
      return [];
    }
  }

  /**
   * Detect which AI platform a URL belongs to.
   * @param {string} url - The URL to classify
   * @returns {string} Platform name like "ChatGPT", "Claude", "Gemini"
   */
  detectAIPlatform(url) {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('chat.openai.com')) return 'ChatGPT';
    if (urlLower.includes('claude.ai')) return 'Claude';
    if (urlLower.includes('bard.google.com') || urlLower.includes('gemini.google.com')) return 'Gemini';
    if (urlLower.includes('copilot.microsoft.com')) return 'Copilot';
    if (urlLower.includes('perplexity.ai')) return 'Perplexity';
    if (urlLower.includes('poe.com')) return 'Poe';
    return 'AI Chat';
  }

  /**
   * Get past similar searches from stored data.
   * @returns {Promise<Object[]>} Array of past search objects
   */
  async getPastSimilarSearches() {
    try {
      const stored = await chrome.storage.local.get('pastSearches');
      return stored.pastSearches || [];
    } catch (error) {
      console.error('Error getting past searches:', error);
      return [];
    }
  }

  /**
   * Detect the type of the current active page.
   * @returns {Promise<string>} Page type: 'ai_chat', 'coding', 'documentation', 'search', or 'general'
   */
  async detectPageType() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab.url?.toLowerCase() || '';
      const title = tab.title?.toLowerCase() || '';

      const aiChatDomains = [
        'chat.openai.com', 'claude.ai', 'bard.google.com',
        'copilot.microsoft.com', 'perplexity.ai'
      ];

      if (aiChatDomains.some(domain => url.includes(domain))) {
        return 'ai_chat';
      }

      if (url.includes('github.com') || url.includes('stackoverflow.com')) {
        return 'coding';
      }

      if (url.includes('docs.') || title.includes('documentation')) {
        return 'documentation';
      }

      if (url.includes('google.com/search') || url.includes('bing.com/search')) {
        return 'search';
      }

      return 'general';
    } catch (error) {
      console.error('Error detecting page type:', error);
      return 'general';
    }
  }

  /**
   * Check if an input text or field name indicates sensitive content.
   * @param {string} text - The input text
   * @param {string} fieldName - The field name or attribute
   * @returns {boolean} True if the input appears sensitive
   */
  isSensitiveInput(text, fieldName) {
    const sensitivePatterns = [
      /password/i, /passwd/i, /pwd/i,
      /credit[_\s-]?card/i, /cc[_\s-]?number/i,
      /ssn/i, /social[_\s-]?security/i,
      /bank[_\s-]?account/i, /account[_\s-]?number/i,
      /cvv/i, /cvc/i, /pin/i,
      /api[_\s-]?key/i, /token/i,
      /email/i, /e-mail/i
    ];

    const combinedText = `${text} ${fieldName}`.toLowerCase();
    return sensitivePatterns.some(pattern => pattern.test(combinedText));
  }
}

// Export singleton instance
const contextCollector = new ContextCollector();
export default contextCollector;