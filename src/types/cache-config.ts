import { StorageAdapter } from './storage-adapter';

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
  
  /**
   * Storage adapter for persisting cache data.
   * If provided, cache data will be persisted using this adapter.
   * @default undefined (no persistence)
   */
  storageAdapter?: StorageAdapter;
  
  /**
   * SECURITY WARNING: Enables deserializing source functions with eval-like operations.
   * 
   * This is a potentially dangerous setting as it allows execution of arbitrary code 
   * when deserializing cache data. If an attacker can tamper with persisted data
   * (e.g., modify a storage file or use XSS to inject into localStorage), this could
   * lead to remote code execution.
   * 
   * Only enable this if you fully trust your storage medium and understand the risks.
   * 
   * @default false
   */
  allowUnsafeSourceFnDeserialization?: boolean;
} 