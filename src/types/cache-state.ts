/**
 * @file Defines TypeScript types for the internal cache state representation.
 */

/**
 * Function type for cache source functions that can refresh cache values.
 * These functions are used for auto-refetching and initial value generation.
 *
 * @template T The type of value returned by the source function
 * @returns {Promise<T> | T} The value to be stored in the cache
 *
 * @example
 * // Synchronous source function
 * const syncSource: SourceFn<string> = () => "cached value";
 *
 * // Asynchronous source function for objects
 * const asyncSource: SourceFn<User> = async () => {
 *   const response = await fetch('/api/user');
 *   return response.json();
 * };
 */
export type SourceFn<T = string> = () => Promise<T> | T;

/**
 * Internal cache state representation for a cache entry.
 * This defines the structure of each entry stored in the cache.
 *
 * @template T The type of the cached value
 * @property {T} value - The cached value
 * @property {string} [serializedValue] - Serialized value for persistence (internal use only)
 * @property {number} createdAt - Timestamp (milliseconds) when the entry was first created
 * @property {number} updatedAt - Timestamp (milliseconds) when the entry was last updated
 * @property {number} [ttl] - Time to live in milliseconds (optional)
 * @property {boolean} [autoRefetch] - Whether to automatically refresh the value when it expires
 * @property {boolean} [fetching] - Whether the entry is currently being fetched
 * @property {SourceFn<T>} [sourceFn] - Function to regenerate the value
 * @property {ReturnType<typeof setTimeout>} [interval] - Timer reference for TTL expiration
 * @property {number} accessCount - Number of times the entry has been accessed (for LFU policy)
 * @property {number} lastAccessed - Timestamp when the entry was last accessed (for LRU policy)
 * @property {string[]} [tags] - Array of tag strings for the cache entry (for tag-based invalidation)
 * @property {string[]} [dependencies] - Array of keys this entry depends on (for dependency invalidation)
 */
export type CacheState<T = string> = {
  value: T;
  serializedValue?: string; // For persistence - only used internally
  createdAt: number;
  updatedAt: number;
  ttl?: number;
  autoRefetch?: boolean;
  fetching?: boolean;
  sourceFn?: SourceFn<T>;
  interval?: ReturnType<typeof setTimeout>;
  // LRU/LFU metadata
  accessCount: number;
  lastAccessed: number;
  // Tag and dependency support
  tags?: string[];
  dependencies?: string[];
};
