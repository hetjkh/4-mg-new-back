/**
 * Cache Utility
 * Provides in-memory caching with TTL support
 * Can be easily extended to use Redis in the future
 */

class Cache {
  constructor() {
    this.store = new Map();
    this.timers = new Map();
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if not found/expired
   */
  get(key) {
    const item = this.store.get(key);
    
    if (!item) {
      return null;
    }

    // Check if expired
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Set a value in cache with optional TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlSeconds - Time to live in seconds (optional)
   * @returns {boolean} - Success status
   */
  set(key, value, ttlSeconds = null) {
    const item = {
      value,
      expiresAt: ttlSeconds ? Date.now() + (ttlSeconds * 1000) : null,
      createdAt: Date.now(),
    };

    this.store.set(key, item);

    // Clear existing timer if any
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Set timer to auto-delete if TTL is provided
    if (ttlSeconds) {
      const timer = setTimeout(() => {
        this.delete(key);
      }, ttlSeconds * 1000);
      this.timers.set(key, timer);
    }

    return true;
  }

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   * @returns {boolean} - Success status
   */
  delete(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    return this.store.delete(key);
  }

  /**
   * Check if a key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    const item = this.store.get(key);
    if (!item) return false;
    
    // Check if expired
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Clear all cache entries
   * @param {string} pattern - Optional pattern to match keys (e.g., 'analytics:*')
   */
  clear(pattern = null) {
    if (pattern) {
      // Clear keys matching pattern
      const regex = new RegExp(pattern.replace('*', '.*'));
      for (const key of this.store.keys()) {
        if (regex.test(key)) {
          this.delete(key);
        }
      }
    } else {
      // Clear all
      for (const key of this.timers.keys()) {
        clearTimeout(this.timers.get(key));
      }
      this.timers.clear();
      this.store.clear();
    }
  }

  /**
   * Get cache statistics
   * @returns {object} - Cache stats
   */
  getStats() {
    // Clean expired entries first
    const now = Date.now();
    for (const [key, item] of this.store.entries()) {
      if (item.expiresAt && now > item.expiresAt) {
        this.delete(key);
      }
    }

    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
    };
  }

  /**
   * Generate cache key from request parameters
   * @param {string} prefix - Key prefix (e.g., 'analytics')
   * @param {object} params - Parameters to include in key
   * @returns {string} - Generated cache key
   */
  generateKey(prefix, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => {
        const value = params[key];
        // Properly serialize objects and arrays
        if (value === null || value === undefined) {
          return `${key}:null`;
        }
        if (typeof value === 'object') {
          // For query objects, create a sorted string representation
          if (Array.isArray(value)) {
            return `${key}:${JSON.stringify(value.sort())}`;
          }
          // Sort object keys and stringify
          const sortedObj = Object.keys(value)
            .sort()
            .reduce((acc, k) => {
              acc[k] = value[k];
              return acc;
            }, {});
          return `${key}:${JSON.stringify(sortedObj)}`;
        }
        return `${key}:${String(value)}`;
      })
      .join('|');
    
    return sortedParams 
      ? `${prefix}:${sortedParams}`
      : prefix;
  }
}

// Create singleton instance
const cache = new Cache();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of cache.store.entries()) {
    if (item.expiresAt && now > item.expiresAt) {
      cache.delete(key);
    }
  }
}, 5 * 60 * 1000); // 5 minutes

module.exports = cache;

