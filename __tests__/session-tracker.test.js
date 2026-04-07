/**
 * Tests for session-tracker.js
 */

import { jest } from '@jest/globals';
import SessionTracker from '../src/services/session-tracker.js';
import { resetChromeMocks } from './__mocks__/chrome.js';

describe('SessionTracker', () => {
  beforeEach(() => {
    resetChromeMocks();
  });

  describe('recordQuery', () => {
    it('should record a valid query', async () => {
      await SessionTracker.recordQuery('react hooks', []);
      const context = await SessionTracker.getIntentContext();
      expect(context.sessionSummary).toContain('react');
      expect(context.recentThread).toContain('react hooks');
    });

    it('should ignore empty or whitespace-only queries', async () => {
      resetChromeMocks();
      await SessionTracker.recordQuery('', []);
      await SessionTracker.recordQuery('   ', []);
      const context = await SessionTracker.getIntentContext();
      expect(context.sessionSummary).toBe('');
    });

    it('should ignore queries shorter than 2 characters', async () => {
      resetChromeMocks();
      await SessionTracker.recordQuery('a', []);
      const context = await SessionTracker.getIntentContext();
      expect(context.sessionSummary).toBe('');
    });

    it('should build a session summary from multiple queries', async () => {
      resetChromeMocks();
      await SessionTracker.recordQuery('python async', []);
      await SessionTracker.recordQuery('asyncio event loop', []);
      await SessionTracker.recordQuery('python concurrency', []);
      const context = await SessionTracker.getIntentContext();
      expect(context.sessionSummary).toContain('Researching:');
    });

    it('should build a thread from recent queries', async () => {
      resetChromeMocks();
      await SessionTracker.recordQuery('query one', []);
      await SessionTracker.recordQuery('query two', []);
      const context = await SessionTracker.getIntentContext();
      expect(context.recentThread).toContain('query one');
      expect(context.recentThread).toContain('query two');
    });
  });

  describe('getIntentContext', () => {
    it('should return empty strings for a fresh session', async () => {
      resetChromeMocks();
      const context = await SessionTracker.getIntentContext();
      expect(context).toEqual({ sessionSummary: '', recentThread: '' });
    });

    it('should return context after recording queries', async () => {
      resetChromeMocks();
      await SessionTracker.recordQuery('test query', []);
      const context = await SessionTracker.getIntentContext();
      expect(typeof context.sessionSummary).toBe('string');
      expect(typeof context.recentThread).toBe('string');
    });
  });

  describe('clearSession', () => {
    it('should clear the stored session', async () => {
      resetChromeMocks();
      await SessionTracker.recordQuery('test query', []);
      await SessionTracker.clearSession();
      const context = await SessionTracker.getIntentContext();
      expect(context).toEqual({ sessionSummary: '', recentThread: '' });
    });
  });
});
