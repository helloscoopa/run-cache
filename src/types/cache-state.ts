/**
 * Function type for cache source functions that can refresh cache values
 */
export type SourceFn = () => Promise<string> | string;

/**
 * Internal cache state representation for a cache entry
 */
export type CacheState = {
  value: string;
  createdAt: number;
  updatedAt: number;
  ttl?: number;
  autoRefetch?: boolean;
  fetching?: boolean;
  sourceFn?: SourceFn;
  interval?: ReturnType<typeof setInterval>;
  // LRU/LFU metadata
  accessCount: number;
  lastAccessed: number;
}; 