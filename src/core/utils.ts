import { CacheState } from '../types/cache-state';

/**
 * Cache for compiled regex patterns to improve performance when using the same patterns multiple times.
 * Maps pattern strings to their compiled RegExp objects.
 * @private
 */
const patternCache = new Map<string, RegExp>();

/**
 * Checks if a cache entry is expired based on its TTL (time-to-live).
 * 
 * @param {CacheState} cache - The cache entry to check for expiration
 * @returns {boolean} true if the entry has a TTL and current time exceeds creation time + TTL, false otherwise
 * 
 * @example
 * if (isExpired(cacheEntry)) {
 *   // Handle expired entry...
 * }
 */
export const isExpired = (cache: CacheState): boolean => {
  if (!cache.ttl) return false;
  return cache.updatedAt + cache.ttl < Date.now();
};

/**
 * Validates that a TTL value is positive when provided.
 * This function enforces proper TTL values throughout the caching system.
 * 
 * @param {number | undefined} ttl - The TTL value to validate, in milliseconds
 * @param {string} [keyForLogging] - Optional key name for more descriptive error messages
 * @throws {Error} If TTL is defined but not positive (<=0)
 * 
 * @example
 * try {
 *   validateTTL(60000, 'user:123');  // Valid
 *   validateTTL(-1000, 'user:456');  // Will throw error
 * } catch (err) {
 *   console.error(err);
 * }
 */
export const validateTTL = (ttl: number | undefined, keyForLogging?: string): void => {
  if (ttl !== undefined && ttl <= 0) {
    // For backward compatibility with existing tests
    throw new Error("`ttl` cannot be negative");
  }
};

/**
 * Utility function to check if a key matches a pattern, supporting wildcard (*) syntax.
 * This is the core function that enables pattern matching throughout the cache operations.
 * 
 * @param {string} pattern - The pattern to match against (can include * wildcard)
 * @param {string} key - The key to check against the pattern
 * @returns {boolean} true if the key matches the pattern, false otherwise
 * 
 * @example
 * matchesPattern('user:*', 'user:123')      // true
 * matchesPattern('user:1*3', 'user:123')    // true
 * matchesPattern('user:*:active', 'user:123:active') // true
 * matchesPattern('product:*', 'user:123')   // false
 */
export const matchesPattern = (pattern: string, key: string): boolean => {
  if (!pattern.includes("*")) {
    return pattern === key;
  }
  
  // Get or create regex pattern
  const regexPattern = patternCache.get(pattern) ?? (() => {
    // Escape all RegExp metacharacters **except** the wildcard `*`
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")   // escape meta
      .replace(/\\\*/g, "*");                  // unescape *
    
    // Replace * with .* for wildcard matching
    const regex = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
    patternCache.set(pattern, regex);
    return regex;
  })();
  
  return regexPattern.test(key);
};

/**
 * Gets all keys that match a pattern from a collection of keys.
 * This enables wildcard operations throughout the cache system.
 * 
 * @param {string} pattern - The pattern to match (can include * wildcard)
 * @param {string[]} allKeys - Array of all available keys to search through
 * @returns {string[]} Array of keys that match the given pattern
 * 
 * @example
 * const keys = ['user:123', 'user:456', 'product:789'];
 * getMatchingKeys('user:*', keys)  // Returns ['user:123', 'user:456']
 * getMatchingKeys('*:123', keys)   // Returns ['user:123']
 * getMatchingKeys('admin:*', keys) // Returns []
 */
export const getMatchingKeys = (pattern: string, allKeys: string[]): string[] => {
  if (!pattern.includes("*")) {
    return allKeys.includes(pattern) ? [pattern] : [];
  }

  const matchingKeys: string[] = [];
  for (const cacheKey of allKeys) {
    if (matchesPattern(pattern, cacheKey)) {
      matchingKeys.push(cacheKey);
    }
  }
  return matchingKeys;
};

/**
 * Validates a CacheState object for correctness and consistency.
 * Ensures all required fields are present and have valid values.
 * 
 * @param {CacheState} state - The CacheState object to validate
 * @param {string} [keyForLogging] - Optional key name for more descriptive error messages
 * @throws {Error} If any validation check fails:
 *   - If TTL is negative
 *   - If value is missing
 *   - If timestamps are invalid
 *   - If autoRefetch is enabled without TTL or sourceFn
 * 
 * @example
 * try {
 *   validateCacheState(cacheStateObj, 'user:123');
 * } catch (err) {
 *   console.error('Invalid cache state:', err.message);
 * }
 */
export const validateCacheState = (state: CacheState, keyForLogging?: string): void => {
  // Validate TTL if present
  validateTTL(state.ttl, keyForLogging);
  
  // Validate that value is provided
  if (!state.value && state.value !== '') {
    throw new Error("Cache value cannot be empty");
  }
  
  // Validate timestamps
  if (!state.createdAt || state.createdAt <= 0) {
    throw new Error("Invalid createdAt timestamp");
  }
  
  if (!state.updatedAt || state.updatedAt <= 0) {
    throw new Error("Invalid updatedAt timestamp");
  }
  
  // Validate that autoRefetch is only set when TTL and sourceFn are available
  if (state.autoRefetch === true) {
    if (state.ttl === undefined) {
      throw new Error("`autoRefetch` is not allowed without a `ttl`");
    }
    
    if (typeof state.sourceFn !== 'function') {
      throw new Error("`autoRefetch` requires sourceFn to be set");
    }
  }
}; 