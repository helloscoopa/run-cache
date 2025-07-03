import { CacheStore } from './cache-store';
import { EvictionPolicy } from '../types/cache-config';

describe('CacheStore', () => {
  let cacheStore: CacheStore;

  beforeEach(async () => {
    cacheStore = await CacheStore.create();
  });

  afterEach(() => {
    cacheStore.flush();
    cacheStore.clearEventListeners();
  });

  describe('set & get operations', () => {
    it('should store and retrieve values', async () => {
      const key = 'test-key';
      const value = 'test-value';

      await expect(cacheStore.set({ key, value })).resolves.toBe(true);
      await expect(cacheStore.get(key)).resolves.toBe(value);
    });

    it('should throw error when key is empty', async () => {
      await expect(cacheStore.set({ key: '', value: 'value' })).rejects.toThrow('Empty key');
    });

    it('should throw error when both value and sourceFn are missing', async () => {
      await expect(cacheStore.set({ key: 'test-key' })).rejects.toThrow(
        "`value` can't be empty without a `sourceFn`",
      );
    });

    it('should throw error when ttl is negative', async () => {
      await expect(cacheStore.set({
        key: 'test-key',
        value: 'test-value',
        ttl: -1,
      })).rejects.toThrow('`ttl` cannot be negative');
    });

    it('should update existing value when set with same key', async () => {
      const key = 'test-key';

      await cacheStore.set({ key, value: 'original-value' });
      await cacheStore.set({ key, value: 'updated-value' });

      await expect(cacheStore.get(key)).resolves.toBe('updated-value');
    });

    it('should return undefined when key is not found', async () => {
      await expect(cacheStore.get('non-existent-key')).resolves.toBeUndefined();
    });

    it('should return undefined when empty key is provided to get', async () => {
      await expect(cacheStore.get('')).resolves.toBeUndefined();
    });

    it('should support TTL for cache entries', async () => {
      jest.useFakeTimers();

      const key = 'ttl-key';
      const value = 'ttl-value';

      await cacheStore.set({ key, value, ttl: 1000 }); // 1 second TTL
      await expect(cacheStore.get(key)).resolves.toBe(value);

      // Advance time to expire the cache
      jest.advanceTimersByTime(1001);

      await expect(cacheStore.get(key)).resolves.toBeUndefined();

      jest.useRealTimers();
    });
  });

  describe('delete & flush operations', () => {
    it('should delete a specific key', async () => {
      const key = 'delete-key';

      await cacheStore.set({ key, value: 'value' });
      expect(cacheStore.delete(key)).toBe(true);
      await expect(cacheStore.get(key)).resolves.toBeUndefined();
    });

    it('should return false when deleting non-existent key', () => {
      expect(cacheStore.delete('non-existent-key')).toBe(false);
    });

    it('should delete all keys matching wildcard pattern', async () => {
      await cacheStore.set({ key: 'user:1:profile', value: 'profile1' });
      await cacheStore.set({ key: 'user:2:profile', value: 'profile2' });
      await cacheStore.set({ key: 'admin:1:profile', value: 'admin1' });

      expect(cacheStore.delete('user:*:profile')).toBe(true);

      await expect(cacheStore.get('user:1:profile')).resolves.toBeUndefined();
      await expect(cacheStore.get('user:2:profile')).resolves.toBeUndefined();
      await expect(cacheStore.get('admin:1:profile')).resolves.toBe('admin1');
    });

    it('should flush all cache entries', async () => {
      await cacheStore.set({ key: 'key1', value: 'value1' });
      await cacheStore.set({ key: 'key2', value: 'value2' });

      cacheStore.flush();

      await expect(cacheStore.get('key1')).resolves.toBeUndefined();
      await expect(cacheStore.get('key2')).resolves.toBeUndefined();
    });
  });

  describe('has operation', () => {
    it('should return true when key exists and is not expired', async () => {
      await cacheStore.set({ key: 'valid-key', value: 'value' });
      await expect(cacheStore.has('valid-key')).resolves.toBe(true);
    });

    it('should return false when key does not exist', async () => {
      await expect(cacheStore.has('non-existent-key')).resolves.toBe(false);
    });

    it('should return true if any key matching wildcard pattern exists', async () => {
      await cacheStore.set({ key: 'test:1:data', value: 'data1' });
      await expect(cacheStore.has('test:*:data')).resolves.toBe(true);
    });

    it('should return false if no key matching wildcard pattern exists', async () => {
      await cacheStore.set({ key: 'test:1:data', value: 'data1' });
      await expect(cacheStore.has('other:*:data')).resolves.toBe(false);
    });
  });

  describe('configuration', () => {
    it('should update and retrieve configuration', () => {
      // Default config
      expect(cacheStore.getConfig()).toEqual({
        maxEntries: Number.POSITIVE_INFINITY,
        evictionPolicy: EvictionPolicy.NONE,
        debug: false,
      });

      // Update config
      cacheStore.configure({
        maxEntries: 100,
        evictionPolicy: EvictionPolicy.LRU,
        debug: true,
      });

      expect(cacheStore.getConfig()).toEqual({
        maxEntries: 100,
        evictionPolicy: EvictionPolicy.LRU,
        debug: true,
      });

      // Partial update
      cacheStore.configure({
        evictionPolicy: EvictionPolicy.LFU,
      });

      expect(cacheStore.getConfig()).toEqual({
        maxEntries: 100,
        evictionPolicy: EvictionPolicy.LFU,
        debug: true,
      });
    });
  });

  describe('refetch operations', () => {
    it('should use sourceFn to fetch initial value', async () => {
      const sourceFn = jest.fn().mockReturnValue('source-value');

      await cacheStore.set({
        key: 'source-key',
        sourceFn,
      });

      expect(sourceFn).toHaveBeenCalledTimes(1);
      await expect(cacheStore.get('source-key')).resolves.toBe('source-value');
    });

    it('should manually refetch value using sourceFn', async () => {
      const sourceFn = jest.fn()
        .mockReturnValueOnce('initial-value')
        .mockReturnValueOnce('updated-value');

      await cacheStore.set({
        key: 'refetch-key',
        sourceFn,
      });

      await expect(cacheStore.get('refetch-key')).resolves.toBe('initial-value');

      await cacheStore.refetch('refetch-key');

      expect(sourceFn).toHaveBeenCalledTimes(2);
      await expect(cacheStore.get('refetch-key')).resolves.toBe('updated-value');
    });

    it('should return false when refetching without sourceFn', async () => {
      await cacheStore.set({
        key: 'no-source-key',
        value: 'value',
      });

      await expect(cacheStore.refetch('no-source-key')).resolves.toBe(false);
    });

    it('should return false when refetching non-existent key', async () => {
      await expect(cacheStore.refetch('non-existent-key')).resolves.toBe(false);
    });
  });

  describe('eviction policies', () => {
    it('should enforce max size with LRU policy', async () => {
      const infiniteCache = await CacheStore.create();
      const lruCache = await CacheStore.create({
        maxEntries: 2,
        evictionPolicy: EvictionPolicy.LRU,
      });

      // Set more items than max size allows
      await lruCache.set({ key: 'key1', value: 'value1' });
      await lruCache.set({ key: 'key2', value: 'value2' });

      // Access key1 to make it recently used
      await lruCache.get('key1');

      // Add a third item, which should evict key2 (least recently used)
      await lruCache.set({ key: 'key3', value: 'value3' });

      // key1 and key3 should exist, key2 should be evicted
      await expect(lruCache.get('key1')).resolves.toBe('value1');
      await expect(lruCache.get('key2')).resolves.toBeUndefined();
      await expect(lruCache.get('key3')).resolves.toBe('value3');

      // For comparison, infinite cache should keep all items
      await infiniteCache.set({ key: 'key1', value: 'value1' });
      await infiniteCache.set({ key: 'key2', value: 'value2' });
      await infiniteCache.set({ key: 'key3', value: 'value3' });

      await expect(infiniteCache.get('key1')).resolves.toBe('value1');
      await expect(infiniteCache.get('key2')).resolves.toBe('value2');
      await expect(infiniteCache.get('key3')).resolves.toBe('value3');
    });
  });

  describe('backward compatibility', () => {
    it('should handle legacy string values without type metadata', async () => {
      const key = 'legacy-key';
      const value = 'legacy-string-value';

      // Store a simple string value (legacy behavior)
      await cacheStore.set({ key, value });

      // Should retrieve the same string value
      await expect(cacheStore.get(key)).resolves.toBe(value);
    });

    it('should handle values that look like JSON but are plain strings', async () => {
      const key = 'json-like-key';
      const value = '{"this": "looks like JSON but is just a string"}';

      // Store a JSON-like string value
      await cacheStore.set({ key, value });

      // Should retrieve the exact same string
      await expect(cacheStore.get(key)).resolves.toBe(value);
    });

    it('should handle empty string values', async () => {
      const key = 'empty-key';
      const value = '';

      // Store empty string - this should throw an error due to validation
      await expect(cacheStore.set({ key, value })).rejects.toThrow(
        "`value` can't be empty without a `sourceFn`",
      );
    });

    it('should handle numeric string values', async () => {
      const key = 'numeric-key';
      const value = '12345';

      // Store numeric string
      await cacheStore.set({ key, value });

      // Should retrieve as string, not number
      await expect(cacheStore.get(key)).resolves.toBe(value);
      expect(typeof await cacheStore.get(key)).toBe('string');
    });

    it('should handle boolean string values', async () => {
      const key1 = 'bool-key-1';
      const key2 = 'bool-key-2';
      const value1 = 'true';
      const value2 = 'false';

      // Store boolean strings
      await cacheStore.set({ key: key1, value: value1 });
      await cacheStore.set({ key: key2, value: value2 });

      // Should retrieve as strings, not booleans
      await expect(cacheStore.get(key1)).resolves.toBe(value1);
      await expect(cacheStore.get(key2)).resolves.toBe(value2);
      expect(typeof await cacheStore.get(key1)).toBe('string');
      expect(typeof await cacheStore.get(key2)).toBe('string');
    });

    it('should handle mixed legacy and modern values', async () => {
      // Store legacy string value
      await cacheStore.set({ key: 'legacy', value: 'legacy-value' });

      // Store what would be a modern typed value (but stored as string for now)
      await cacheStore.set({ key: 'modern', value: '{"type": "user", "id": 123}' });

      // Both should be retrievable as strings
      await expect(cacheStore.get('legacy')).resolves.toBe('legacy-value');
      await expect(cacheStore.get('modern')).resolves.toBe('{"type": "user", "id": 123}');
    });
  });
});
