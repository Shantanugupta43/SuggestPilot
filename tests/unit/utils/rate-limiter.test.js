/**
 * Unit tests — RateLimiter
 * src/utils/rate-limiter.js
 *
 * RateLimiter is pure logic (no chrome APIs, no network) so it is the
 * simplest module to cover comprehensively.
 */

import RateLimiter from '../../../src/utils/rate-limiter.js';

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new RateLimiter();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('initialises with an empty request log', () => {
      expect(limiter.requests).toEqual([]);
    });

    it('sets windowMs to 60 000 ms by default', () => {
      expect(limiter.windowMs).toBe(60000);
    });
  });

  // ── checkLimit ─────────────────────────────────────────────────────────────

  describe('checkLimit()', () => {
    it('returns true for the first request', () => {
      expect(limiter.checkLimit()).toBe(true);
    });

    it('records each allowed request', () => {
      limiter.checkLimit();
      limiter.checkLimit();
      expect(limiter.requests).toHaveLength(2);
    });

    it('returns false when 10 requests have been made within the window', () => {
      for (let i = 0; i < 10; i++) limiter.checkLimit();
      expect(limiter.checkLimit()).toBe(false);
    });

    it('does NOT record the rejected excess request', () => {
      for (let i = 0; i < 10; i++) limiter.checkLimit();
      limiter.checkLimit(); // rejected
      expect(limiter.requests).toHaveLength(10);
    });

    it('allows a new request after the window expires', () => {
      for (let i = 0; i < 10; i++) limiter.checkLimit();
      // Advance time past the 1-minute window
      jest.advanceTimersByTime(61000);
      expect(limiter.checkLimit()).toBe(true);
    });

    it('evicts timestamps outside the window on each call', () => {
      limiter.checkLimit(); // t = 0
      jest.advanceTimersByTime(61000);
      limiter.checkLimit(); // t = 61 s — old entry should be evicted
      expect(limiter.requests).toHaveLength(1);
    });
  });

  // ── getRemainingRequests ───────────────────────────────────────────────────

  describe('getRemainingRequests()', () => {
    it('returns 10 when no requests have been made', () => {
      expect(limiter.getRemainingRequests()).toBe(10);
    });

    it('decrements with each checkLimit call', () => {
      limiter.checkLimit();
      limiter.checkLimit();
      expect(limiter.getRemainingRequests()).toBe(8);
    });

    it('returns 0 when the limit is exhausted', () => {
      for (let i = 0; i < 10; i++) limiter.checkLimit();
      expect(limiter.getRemainingRequests()).toBe(0);
    });

    it('restores count after window expires', () => {
      for (let i = 0; i < 10; i++) limiter.checkLimit();
      jest.advanceTimersByTime(61000);
      expect(limiter.getRemainingRequests()).toBe(10);
    });
  });

  // ── getTimeUntilReset ──────────────────────────────────────────────────────

  describe('getTimeUntilReset()', () => {
    it('returns 0 when no requests have been made', () => {
      expect(limiter.getTimeUntilReset()).toBe(0);
    });

    it('returns a positive number immediately after a request', () => {
      limiter.checkLimit();
      expect(limiter.getTimeUntilReset()).toBeGreaterThan(0);
    });

    it('approximately equals windowMs right after the first request', () => {
      limiter.checkLimit();
      // Should be very close to 60 000 ms (within 100 ms tolerance)
      expect(limiter.getTimeUntilReset()).toBeLessThanOrEqual(60000);
      expect(limiter.getTimeUntilReset()).toBeGreaterThan(59900);
    });

    it('returns 0 after the window has fully elapsed', () => {
      limiter.checkLimit();
      jest.advanceTimersByTime(61000);
      expect(limiter.getTimeUntilReset()).toBe(0);
    });
  });

  // ── reset ──────────────────────────────────────────────────────────────────

  describe('reset()', () => {
    it('clears all recorded requests', () => {
      for (let i = 0; i < 5; i++) limiter.checkLimit();
      limiter.reset();
      expect(limiter.requests).toHaveLength(0);
    });

    it('allows 10 new requests immediately after reset', () => {
      for (let i = 0; i < 10; i++) limiter.checkLimit();
      limiter.reset();
      expect(limiter.checkLimit()).toBe(true);
      expect(limiter.getRemainingRequests()).toBe(9);
    });
  });
});
