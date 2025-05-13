import { StorageAdapter } from './storage-adapter';

/**
 * Eviction policy for the cache
 */
export enum EvictionPolicy {
  /** No eviction policy - cache will grow indefinitely */
  NONE = 'NONE',
  /** Least Recently Used - evict least recently used entries first */
  LRU = 'LRU',
  /** Least Frequently Used - evict least frequently used entries first */
  LFU = 'LFU',
}

/**
 * Configuration options for the cache
 */
export interface CacheConfig {
  /**
   * Maximum number of entries to store in the cache
   * @default Infinity
   */
  maxEntries?: number;

  /**
   * Default time-to-live in milliseconds for cache entries
   * @default Infinity
   */
  defaultTTL?: number;

  /**
   * Eviction policy to use when cache is full
   * @default EvictionPolicy.NONE
   */
  evictionPolicy?: EvictionPolicy;

  /**
   * Storage adapter for persistence
   * @default null (no persistence)
   */
  storageAdapter?: StorageAdapter;

  /**
   * Whether to enable debug logging
   * @default false
   */
  debug?: boolean;
}
