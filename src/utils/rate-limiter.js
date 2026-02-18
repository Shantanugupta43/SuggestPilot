/**
 * Rate Limiter
 * Prevents API abuse by limiting requests per time window
 */

class RateLimiter {
  constructor() {
    this.requests = [];
    this.windowMs = 60000; // 1 minute
  }

  /**
   * Check if request is within rate limit
   */
  checkLimit() {
    const maxRequests = 10; // Default, can be configured
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    // Check if under limit
    if (this.requests.length >= maxRequests) {
      return false;
    }
    
    // Add current request
    this.requests.push(now);
    return true;
  }

  /**
   * Get remaining requests
   */
  getRemainingRequests() {
    const maxRequests = 10;
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    return Math.max(0, maxRequests - this.requests.length);
  }

  /**
   * Get time until next request is available
   */
  getTimeUntilReset() {
    if (this.requests.length === 0) return 0;
    
    const oldestRequest = Math.min(...this.requests);
    const resetTime = oldestRequest + this.windowMs;
    const now = Date.now();
    
    return Math.max(0, resetTime - now);
  }

  /**
   * Reset rate limiter
   */
  reset() {
    this.requests = [];
  }
}

export default RateLimiter;