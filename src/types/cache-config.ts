/**
 * Cache eviction policy types.
 */
export enum EvictionPolicy {
  /**
   * No automatic eviction policy. Cache entries are removed only via TTL or manual deletion.
   */
  NONE = "none",
  
  /**
   * Least Recently Used policy. Removes the least recently accessed entries when the cache exceeds its maximum size.
   */
  LRU = "lru",
  
  /**
   * Least Frequently Used policy. Removes the least frequently accessed entries when the cache exceeds its maximum size.
   */
  LFU = "lfu",
}

/**
 * Configuration options for RunCache.
 */
export interface RunCacheConfig {
  /**
   * The maximum number of entries the cache can hold before eviction occurs.
   * @default Infinity (no limit)
   */
  maxSize?: number;
  
  /**
   * The eviction policy to use when the cache exceeds its maximum size.
   * @default EvictionPolicy.NONE
   */
  evictionPolicy?: EvictionPolicy;
  
  /**
   * Enable verbose logging to print all cache operations to the console.
   * @default false
   */
  verbose?: boolean;
} 