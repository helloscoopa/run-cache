import { CacheUtils } from './utils';
import { CacheState } from '../types/cache-state';

describe('CacheUtils', () => {
  describe('isExpired', () => {
    it('should return false if cache has no ttl', () => {
      const cache: CacheState = {
        value: 'test value',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now(),
      };

      expect(CacheUtils.isExpired(cache)).toBe(false);
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

      expect(CacheUtils.isExpired(cache)).toBe(false);
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

      expect(CacheUtils.isExpired(cache)).toBe(true);
    });
  });

  describe('matchesPattern', () => {
    it('should return true for exact matches', () => {
      expect(CacheUtils.matchesPattern('exact-key', 'exact-key')).toBe(true);
    });

    it('should return false for non-matching keys', () => {
      expect(CacheUtils.matchesPattern('key1', 'key2')).toBe(false);
    });

    it('should handle wildcard at the beginning', () => {
      expect(CacheUtils.matchesPattern('*-suffix', 'prefix-suffix')).toBe(true);
      expect(CacheUtils.matchesPattern('*-suffix', 'wrong-end')).toBe(false);
    });

    it('should handle wildcard at the end', () => {
      expect(CacheUtils.matchesPattern('prefix-*', 'prefix-suffix')).toBe(true);
      expect(CacheUtils.matchesPattern('prefix-*', 'wrong-suffix')).toBe(false);
    });

    it('should handle wildcard in the middle', () => {
      expect(CacheUtils.matchesPattern('prefix-*-suffix', 'prefix-middle-suffix')).toBe(true);
      expect(CacheUtils.matchesPattern('prefix-*-suffix', 'prefix-wrong-end')).toBe(false);
    });

    it('should handle multiple wildcards', () => {
      expect(CacheUtils.matchesPattern('*:*:profile', 'user:123:profile')).toBe(true);
      expect(CacheUtils.matchesPattern('user:*:*', 'user:123:profile')).toBe(true);
      expect(CacheUtils.matchesPattern('*:*:*', 'anything:goes:here')).toBe(true);
    });

    it('should handle regex special characters correctly', () => {
      expect(CacheUtils.matchesPattern('key.with.dots.*', 'key.with.dots.value')).toBe(true);
      expect(CacheUtils.matchesPattern('key[with]brackets*', 'key[with]brackets-suffix')).toBe(true);
      expect(CacheUtils.matchesPattern('key(with)parens*', 'key(with)parens-suffix')).toBe(true);
    });
  });

  describe('getMatchingKeys', () => {
    it('should return exact key if it exists in the array', () => {
      const keys = ['key1', 'key2', 'key3'];
      expect(CacheUtils.getMatchingKeys('key2', keys)).toEqual(['key2']);
    });

    it('should return empty array for non-matching exact key', () => {
      const keys = ['key1', 'key2', 'key3'];
      expect(CacheUtils.getMatchingKeys('key4', keys)).toEqual([]);
    });

    it('should return all matching keys for wildcard pattern', () => {
      const keys = ['user:1:profile', 'user:2:profile', 'admin:1:profile', 'user:1:settings'];
      expect(CacheUtils.getMatchingKeys('user:*:profile', keys)).toEqual(['user:1:profile', 'user:2:profile']);
    });

    it('should return all keys for full wildcard pattern', () => {
      const keys = ['key1', 'key2', 'key3'];
      expect(CacheUtils.getMatchingKeys('*', keys)).toEqual(keys);
    });
  });
}); 