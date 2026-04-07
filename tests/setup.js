import { jest } from '@jest/globals';

const storageState = {};

global.chrome = {
  storage: {
    local: {
      get: jest.fn(async (keys) => {
        if (!keys) return { ...storageState };

        if (typeof keys === 'string') {
          return { [keys]: storageState[keys] };
        }

        if (Array.isArray(keys)) {
          return keys.reduce((acc, key) => {
            acc[key] = storageState[key];
            return acc;
          }, {});
        }

        if (typeof keys === 'object') {
          return Object.keys(keys).reduce((acc, key) => {
            acc[key] = storageState[key] ?? keys[key];
            return acc;
          }, {});
        }

        return {};
      }),

      set: jest.fn(async (obj) => {
        Object.assign(storageState, obj);
      }),

      remove: jest.fn(async (key) => {
        if (Array.isArray(key)) {
          key.forEach((k) => delete storageState[k]);
        } else {
          delete storageState[key];
        }
      }),

      clear: jest.fn(async () => {
        Object.keys(storageState).forEach((k) => delete storageState[k]);
      })
    }
  }
};

beforeEach(async () => {
  await chrome.storage.local.clear();
  jest.clearAllMocks();
});
