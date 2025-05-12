/**
 * @file Defines TypeScript types for the internal cache state representation.
 */

/**
 * Function type for cache source functions that can refresh cache values.
 * These functions are used for auto-refetching and initial value generation.
 * 
 * @returns {Promise<string> | string} The string value to be stored in the cache
 * 
 * @example
 * // Synchronous source function
 * const syncSource: SourceFn = () => "cached value";
 * 
 * // Asynchronous source function
 * const asyncSource: SourceFn = async () => {
 *   const response = await fetch('/api/data');
 *   return response.text();
 * };
 */
export type SourceFn = () => Promise<string> | string;

/**
 * Internal cache state representation for a cache entry.
 * This defines the structure of each entry stored in the cache.
 * 
 * @property {string} value - The cached value
 * @property {number} createdAt - Timestamp (milliseconds) when the entry was first created
 * @property {number} updatedAt - Timestamp (milliseconds) when the entry was last updated
 * @property {number} [ttl] - Time to live in milliseconds (optional)
 * @property {boolean} [autoRefetch] - Whether to automatically refresh the value when it expires
 * @property {boolean} [fetching] - Whether the entry is currently being fetched
 * @property {SourceFn} [sourceFn] - Function to regenerate the value
 * @property {ReturnType<typeof setTimeout>} [interval] - Timer reference for TTL expiration
 * @property {number} accessCount - Number of times the entry has been accessed (for LFU policy)
 * @property {number} lastAccessed - Timestamp when the entry was last accessed (for LRU policy)
 */
export type CacheState = {
  value: string;
  createdAt: number;
  updatedAt: number;
  ttl?: number;
  autoRefetch?: boolean;
  fetching?: boolean;
  sourceFn?: SourceFn;
  interval?: ReturnType<typeof setTimeout>;
  // LRU/LFU metadata
  accessCount: number;
  lastAccessed: number;
}; 