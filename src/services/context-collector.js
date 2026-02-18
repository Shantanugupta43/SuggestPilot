/**
 * Context Collector
 * Gathers browsing context from the current page and browser state
 */

class ContextCollector {
  /**
   * Collect full context for suggestion generation
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
   * Get current page context (token optimized)
   */
  async getCurrentPageContext() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const pageInfo = await chrome.tabs.sendMessage(tab.id, { 
        action: 'getPageContext' 
      }).catch(() => ({
        title: tab.title || '',
        headings: []
      }));

      return {
        title: pageInfo.title || tab.title || '',
        url: tab.url || '',
        headings: (pageInfo.headings || []).slice(0, 3) // Only top 3 headings
        // Removed summary and mainContent to save tokens
      };
    } catch (error) {
      console.error('Error getting current page context:', error);
      return { title: '', url: '', headings: [] };
    }
  }

  /**
   * Get top 5 active tabs (token optimized)
   * EXCLUDES the current active tab - only returns OTHER tabs user has open
   */
  async getActiveTabsContext() {
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      console.log('🔍 Total tabs in window:', tabs.length);
      console.log('📍 Current active tab:', currentTab?.title);
      
      const sensitiveDomains = [
        'bank', 'login', 'signin', 'auth', 'payment',
        'checkout', 'account', 'admin', 'dashboard'
      ];

      const activeTabs = tabs
        .filter(tab => {
          // EXCLUDE the current active tab
          if (tab.id === currentTab?.id) {
            console.log('⏭️ Skipping current active tab:', tab.title);
            return false;
          }
          
          const url = tab.url?.toLowerCase() || '';
          const isFiltered = sensitiveDomains.some(domain => url.includes(domain));
          if (isFiltered) {
            console.log('🚫 Filtered sensitive tab:', tab.title);
          }
          return !isFiltered;
        })
        .slice(0, 5) // Get top 5 OTHER tabs
        .map(tab => ({
          title: tab.title || '',
          url: tab.url || ''
        }));

      console.log('Other tabs collected (excluding current):', activeTabs.length);
      activeTabs.forEach((tab, i) => {
        console.log(`  ${i + 1}. "${tab.title}"`);
      });

      return activeTabs;
    } catch (error) {
      console.error('Error getting active tabs:', error);
      return [];
    }
  }

  /**
   * Get active input text from focused element
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
   * Get recent browsing history (token optimized)
   */
  async getRecentHistory() {
    try {
      const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
      const history = await chrome.history.search({
        text: '',
        startTime: twoHoursAgo,
        maxResults: 15 // Reduced for token efficiency
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
   * Get top 5 most visited sites (token optimized)
   */
  async getTopVisitedTitles() {
    try {
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const history = await chrome.history.search({
        text: '',
        startTime: oneWeekAgo,
        maxResults: 50 // Reduced sample size
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
        .slice(0, 5) // Reduced to top 5
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
   * Get recent AI chat tabs (token optimized)
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
        maxResults: 20 // Reduced sample
      });

      const aiTabs = history
        .filter(item => {
          const url = item.url?.toLowerCase() || '';
          return aiDomains.some(domain => url.includes(domain));
        })
        .slice(0, 3) // Reduced to 3 for token efficiency
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
   * Detect which AI platform from URL
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
   * Get past similar searches (from stored data)
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
   * Detect page type
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
   * Check if input is sensitive
   */
  isSensitiveInput(text, fieldName) {
    const sensitivePatterns = [
      /password/i, /passwd/i, /pwd/i,
      /credit[_\s-]?card/i, /cc[_\s-]?number/i,
      /ssn/i, /social[_\s-]?security/i,
      /bank[_\s-]?account/i, /account[_\s-]?number/i,
      /cvv/i, /cvc/i, /pin/i,
      /api[_\s-]?key/i, /token/i
    ];

    const combinedText = `${text} ${fieldName}`.toLowerCase();
    return sensitivePatterns.some(pattern => pattern.test(combinedText));
  }
}

// Export singleton instance
const contextCollector = new ContextCollector();
export default contextCollector;