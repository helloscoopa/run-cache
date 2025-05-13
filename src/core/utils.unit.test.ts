import {
  isExpired, matchesPattern, getMatchingKeys, validateTTL, validateCacheState,
} from './utils';
import { CacheState } from '../types/cache-state';

describe('Cache Utilities', () => {
  describe('isExpired', () => {
    it('should return false if cache has no ttl', () => {
      const cache: CacheState = {
        value: 'test value',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now(),
      };

      expect(isExpired(cache)).toBe(false);
    });

    it('should return false if cache has not expired yet', () => {
      const now = Date.now();
      const cache: CacheState = {
        value: 'test value',
        createdAt: now,
        updatedAt: now,
        ttl: 1000, // 1 second
        accessCount: 0,
        lastAccessed: now,
      };

      expect(isExpired(cache)).toBe(false);
    });

    it('should return true if cache has expired', () => {
      const now = Date.now();
      const cache: CacheState = {
        value: 'test value',
        createdAt: now - 2000, // 2 seconds ago
        updatedAt: now - 2000,
        ttl: 1000, // 1 second
        accessCount: 0,
        lastAccessed: now - 2000,
      };

      expect(isExpired(cache)).toBe(true);
    });
  });

  describe('matchesPattern', () => {
    it('should return true for exact matches', () => {
      expect(matchesPattern('exact-key', 'exact-key')).toBe(true);
    });

    it('should return false for non-matching keys', () => {
      expect(matchesPattern('key1', 'key2')).toBe(false);
    });

    it('should handle wildcard at the beginning', () => {
      expect(matchesPattern('*-suffix', 'prefix-suffix')).toBe(true);
      expect(matchesPattern('*-suffix', 'wrong-end')).toBe(false);
    });

    it('should handle wildcard at the end', () => {
      expect(matchesPattern('prefix-*', 'prefix-suffix')).toBe(true);
      expect(matchesPattern('prefix-*', 'wrong-suffix')).toBe(false);
    });

    it('should handle wildcard in the middle', () => {
      expect(matchesPattern('prefix-*-suffix', 'prefix-middle-suffix')).toBe(true);
      expect(matchesPattern('prefix-*-suffix', 'prefix-wrong-end')).toBe(false);
    });

    it('should handle multiple wildcards', () => {
      expect(matchesPattern('*:*:profile', 'user:123:profile')).toBe(true);
      expect(matchesPattern('user:*:*', 'user:123:profile')).toBe(true);
      expect(matchesPattern('*:*:*', 'anything:goes:here')).toBe(true);
    });

    it('should handle regex special characters correctly', () => {
      expect(matchesPattern('key.with.dots.*', 'key.with.dots.value')).toBe(true);
      expect(matchesPattern('key[with]brackets*', 'key[with]brackets-suffix')).toBe(true);
      expect(matchesPattern('key(with)parens*', 'key(with)parens-suffix')).toBe(true);
    });
  });

  describe('getMatchingKeys', () => {
    it('should return exact key if it exists in the array', () => {
      const keys = ['key1', 'key2', 'key3'];
      expect(getMatchingKeys('key2', keys)).toEqual(['key2']);
    });

    it('should return empty array for non-matching exact key', () => {
      const keys = ['key1', 'key2', 'key3'];
      expect(getMatchingKeys('key4', keys)).toEqual([]);
    });

    it('should return all matching keys for wildcard pattern', () => {
      const keys = ['user:1:profile', 'user:2:profile', 'admin:1:profile', 'user:1:settings'];
      expect(getMatchingKeys('user:*:profile', keys)).toEqual(['user:1:profile', 'user:2:profile']);
    });

    it('should return all keys for full wildcard pattern', () => {
      const keys = ['key1', 'key2', 'key3'];
      expect(getMatchingKeys('*', keys)).toEqual(keys);
    });
  });

  describe('validateTTL', () => {
    it('should not throw error for undefined ttl', () => {
      expect(() => validateTTL(undefined)).not.toThrow();
    });

    it('should not throw error for positive ttl', () => {
      expect(() => validateTTL(1000)).not.toThrow();
    });

    it('should throw error for zero ttl', () => {
      expect(() => validateTTL(0)).toThrow('`ttl` cannot be negative');
    });

    it('should throw error for negative ttl', () => {
      expect(() => validateTTL(-1000)).toThrow('`ttl` cannot be negative');
    });
  });

  describe('validateCacheState', () => {
    it('should not throw error for valid cache state', () => {
      const now = Date.now();
      const validState: CacheState = {
        value: 'test value',
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
        lastAccessed: now,
      };

      expect(() => validateCacheState(validState)).not.toThrow();
    });

    it('should throw error for missing value', () => {
      const now = Date.now();
      const invalidState = {
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
        lastAccessed: now,
      } as CacheState;

      expect(() => validateCacheState(invalidState)).toThrow('Cache value cannot be empty');
    });

    it('should throw error for invalid ttl', () => {
      const now = Date.now();
      const invalidState: CacheState = {
        value: 'test value',
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
        lastAccessed: now,
        ttl: -1000,
      };

      expect(() => validateCacheState(invalidState)).toThrow('`ttl` cannot be negative');
    });

    it('should throw error for invalid createdAt', () => {
      const now = Date.now();
      const invalidState: CacheState = {
        value: 'test value',
        createdAt: 0,
        updatedAt: now,
        accessCount: 0,
        lastAccessed: now,
      };

      expect(() => validateCacheState(invalidState)).toThrow('Invalid createdAt timestamp');
    });

    it('should throw error for invalid updatedAt', () => {
      const now = Date.now();
      const invalidState: CacheState = {
        value: 'test value',
        createdAt: now,
        updatedAt: 0,
        accessCount: 0,
        lastAccessed: now,
      };

      expect(() => validateCacheState(invalidState)).toThrow('Invalid updatedAt timestamp');
    });

    it('should throw error for autoRefetch without ttl', () => {
      const now = Date.now();
      const invalidState: CacheState = {
        value: 'test value',
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
        lastAccessed: now,
        autoRefetch: true,
        sourceFn: () => 'new value',
      };

      expect(() => validateCacheState(invalidState)).toThrow('`autoRefetch` is not allowed without a `ttl`');
    });

    it('should throw error for autoRefetch without sourceFn', () => {
      const now = Date.now();
      const invalidState: CacheState = {
        value: 'test value',
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
        lastAccessed: now,
        autoRefetch: true,
        ttl: 1000,
      };

      expect(() => validateCacheState(invalidState)).toThrow('`autoRefetch` requires sourceFn to be set');
    });
  });
});
