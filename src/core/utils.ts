import { CacheState } from '../types/cache-state';

/**
 * Cache for compiled regex patterns
 */
const patternCache = new Map<string, RegExp>();

/**
 * Checks if a cache entry is expired
 * @param cache The cache entry to check
 * @returns true if the entry is expired, false otherwise
 */
export const isExpired = (cache: CacheState): boolean => {
  if (!cache.ttl) return false;
  return cache.updatedAt + cache.ttl < Date.now();
};

/**
 * Validates that a TTL value is positive when provided
 * @param ttl The TTL value to validate
 * @param keyForLogging Optional key name for error messages
 * @throws Error if TTL is defined but not positive
 */
export const validateTTL = (ttl: number | undefined, keyForLogging?: string): void => {
  if (ttl !== undefined && ttl <= 0) {
    // For backward compatibility with existing tests
    throw new Error("`ttl` cannot be negative");
  }
};

/**
 * Utility function to check if a key matches a pattern (supporting wildcards)
 * @param pattern The pattern to match against (can include * wildcard)
 * @param key The key to check
 * @returns boolean indicating if the key matches the pattern
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
 * Gets all keys that match a pattern from a collection of keys
 * @param pattern The pattern to match (can include * wildcard)
 * @param allKeys Array of all available keys
 * @returns Array of matching keys
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
 * Validates a CacheState object for correctness
 * @param state The CacheState object to validate
 * @param keyForLogging Optional key name for error messages
 * @throws Error if any validation fails
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