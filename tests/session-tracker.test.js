import sessionTracker from '../src/services/session-tracker.js';

describe('session-tracker', () => {
  test('recordQuery stores query and builds intent context', async () => {
    await sessionTracker.recordQuery('python asyncio performance tips', [
      { text: 'Best asyncio performance practices' }
    ]);

    const ctx = await sessionTracker.getIntentContext();

    expect(ctx.sessionSummary).toContain('Researching:');
    expect(ctx.sessionSummary).toContain('python');
    expect(ctx.recentThread).toContain('python asyncio performance tips');
  });

  test('recordQuery keeps rolling window at max 20 queries', async () => {
    for (let i = 1; i <= 25; i++) {
      await sessionTracker.recordQuery(`query ${i}`);
    }

    const stored = await chrome.storage.local.get('sessionIntent');
    expect(stored.sessionIntent.queries).toHaveLength(20);
    expect(stored.sessionIntent.queries[0].text).toBe('query 6');
    expect(stored.sessionIntent.queries[19].text).toBe('query 25');
  });

  test('getIntentContext resets expired session', async () => {
    const oldTime = Date.now() - (3 * 60 * 60 * 1000);
    await chrome.storage.local.set({
      sessionIntent: {
        queries: [{ text: 'old query', suggestions: [], timestamp: oldTime }],
        sessionSummary: 'Researching: old',
        recentThread: 'old query',
        startedAt: oldTime,
        updatedAt: oldTime
      }
    });

    const ctx = await sessionTracker.getIntentContext();
    expect(ctx.sessionSummary).toBe('');
    expect(ctx.recentThread).toBe('');
  });

  test('clearSession removes storage entry', async () => {
    await sessionTracker.recordQuery('temporary query');
    await sessionTracker.clearSession();
    const stored = await chrome.storage.local.get('sessionIntent');
    expect(stored.sessionIntent).toBeUndefined();
  });
});
