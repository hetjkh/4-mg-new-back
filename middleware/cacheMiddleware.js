/**
 * Cache Middleware
 * Provides caching for Express routes with configurable TTL
 */

const cache = require('../utils/cache');

/**
 * Cache middleware factory
 * @param {object} options - Cache options
 * @param {number} options.ttl - Time to live in seconds
 * @param {string} options.prefix - Cache key prefix
 * @param {function} options.keyGenerator - Custom key generator function
 * @param {function} options.shouldCache - Function to determine if response should be cached
 * @returns {function} - Express middleware
 */
const cacheMiddleware = (options = {}) => {
  const {
    ttl = 300, // Default 5 minutes
    prefix = 'cache',
    keyGenerator = null,
    shouldCache = (req, res) => res.statusCode === 200,
  } = options;

  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Generate cache key
    const cacheKey = keyGenerator
      ? keyGenerator(req)
      : cache.generateKey(prefix, {
          path: req.path,
          query: req.query,
          user: req.user?._id?.toString(),
        });

    // Try to get from cache
    const cached = cache.get(cacheKey);
    if (cached !== null) {
      console.log(`✅ Cache HIT: ${cacheKey}`);
      return res.json(cached);
    }

    console.log(`❌ Cache MISS: ${cacheKey}`);

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to cache response
    res.json = function (data) {
      // Only cache successful responses
      if (shouldCache(req, res) && data) {
        cache.set(cacheKey, data, ttl);
        console.log(`💾 Cached: ${cacheKey} (TTL: ${ttl}s)`);
      }
      return originalJson(data);
    };

    next();
  };
};

/**
 * Invalidate cache by pattern
 * @param {string} pattern - Pattern to match keys (e.g., 'analytics:*')
 */
const invalidateCache = (pattern) => {
  cache.clear(pattern);
  console.log(`🗑️  Cache invalidated: ${pattern}`);
};

/**
 * Cache middleware with different TTLs for different routes
 */
const cacheConfigs = {
  // Analytics routes - cache for 5 minutes (frequently accessed, data changes moderately)
  analytics: cacheMiddleware({
    ttl: 300, // 5 minutes
    prefix: 'analytics',
  }),

  // Revenue analytics - cache for 2 minutes (changes more frequently)
  revenue: cacheMiddleware({
    ttl: 120, // 2 minutes
    prefix: 'analytics:revenue',
  }),

  // Product performance - cache for 5 minutes
  products: cacheMiddleware({
    ttl: 300, // 5 minutes
    prefix: 'analytics:products',
  }),

  // Dealer performance - cache for 5 minutes
  dealers: cacheMiddleware({
    ttl: 300, // 5 minutes
    prefix: 'analytics:dealers',
  }),

  // Salesman performance - cache for 5 minutes
  salesmen: cacheMiddleware({
    ttl: 300, // 5 minutes
    prefix: 'analytics:salesmen',
  }),

  // Stock movement - cache for 3 minutes
  stockMovement: cacheMiddleware({
    ttl: 180, // 3 minutes
    prefix: 'analytics:stock',
  }),

  // Location analytics - cache for 5 minutes
  locations: cacheMiddleware({
    ttl: 300, // 5 minutes
    prefix: 'analytics:locations',
  }),

  // Sales reports - cache for 2 minutes
  salesReport: cacheMiddleware({
    ttl: 120, // 2 minutes
    prefix: 'sales:report',
  }),

  // Dashboard queries - cache for 1 minute (changes frequently)
  dashboard: cacheMiddleware({
    ttl: 60, // 1 minute
    prefix: 'dashboard',
  }),
};

module.exports = {
  cacheMiddleware,
  invalidateCache,
  cacheConfigs,
};

