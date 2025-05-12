import { CacheState } from '../types/cache-state';

/**
 * Utility class for common cache operations
 */
export class CacheUtils {
  /**
   * Checks if a cache entry is expired
   * @param cache The cache entry to check
   * @returns true if the entry is expired, false otherwise
   */
  static isExpired(cache: CacheState): boolean {
    if (!cache.ttl) return false;
    return cache.updatedAt + cache.ttl < Date.now();
  }

  /**
   * Utility function to check if a key matches a pattern (supporting wildcards)
   * @param pattern The pattern to match against (can include * wildcard)
   * @param key The key to check
   * @returns boolean indicating if the key matches the pattern
   */
  static matchesPattern(pattern: string, key: string): boolean {
    if (!pattern.includes("*")) {
      return pattern === key;
    }
    
    // Escape all RegExp metacharacters **except** the wildcard `*`
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")   // escape meta
      .replace(/\\\*/g, "*");                  // unescape *
    
    // Replace * with .* for wildcard matching
    const regexPattern = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
    return regexPattern.test(key);
  }

  /**
   * Gets all keys that match a pattern from a collection of keys
   * @param pattern The pattern to match (can include * wildcard)
   * @param allKeys Array of all available keys
   * @returns Array of matching keys
   */
  static getMatchingKeys(pattern: string, allKeys: string[]): string[] {
    if (!pattern.includes("*")) {
      return allKeys.includes(pattern) ? [pattern] : [];
    }

    const matchingKeys: string[] = [];
    for (const cacheKey of allKeys) {
      if (this.matchesPattern(pattern, cacheKey)) {
        matchingKeys.push(cacheKey);
      }
    }
    return matchingKeys;
  }
} 