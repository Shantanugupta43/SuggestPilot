/**
 * Chrome API mock for Jest tests
 */
import { jest } from '@jest/globals';

const storageData = {};

globalThis.chrome = {
  runtime: {
    sendMessage: jest.fn(() => Promise.resolve({ success: true }))
  },
  storage: {
    local: {
      get: jest.fn((keys) => {
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: storageData[keys] });
        }
        if (Array.isArray(keys)) {
          const result = {};
          keys.forEach(k => { result[k] = storageData[k]; });
          return Promise.resolve(result);
        }
        return Promise.resolve({ ...storageData });
      }),
      set: jest.fn((data) => {
        Object.assign(storageData, data);
        return Promise.resolve();
      }),
      remove: jest.fn((keys) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach(k => { delete storageData[k]; });
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        Object.keys(storageData).forEach(k => { delete storageData[k]; });
        return Promise.resolve();
      })
    }
  },
  tabs: {
    query: jest.fn(() => Promise.resolve([])),
    sendMessage: jest.fn(() => Promise.resolve({}))
  },
  history: {
    search: jest.fn(() => Promise.resolve([]))
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn()
  }
};

// Helper to reset storage between tests
export const resetChromeMocks = () => {
  Object.keys(storageData).forEach(k => { delete storageData[k]; });
  jest.clearAllMocks();
};

// Also set on globalThis for non-ESM consumers
globalThis.resetChromeMocks = resetChromeMocks;

// Mock fetch
globalThis.fetch = jest.fn();

// Mock navigator for browser detection tests
const originalNavigator = globalThis.navigator;
Object.defineProperty(globalThis, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    language: 'en-US',
    languages: ['en-US', 'en', 'fr']
  },
  writable: true,
  configurable: true
});
