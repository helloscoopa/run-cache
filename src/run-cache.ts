import { CacheStore } from './core/cache-store';
import { RunCacheConfig, EvictionPolicy } from './types/cache-config';
import { EventParam, EventName, EVENT } from './types/events';
import { SourceFn } from './types/cache-state';

// Re-export needed types for backwards compatibility with tests
export { EvictionPolicy, EVENT, EventParam };

// Register shutdown handlers to properly clean up resources
function registerShutdownHandlers(): void {
  // Node.js environment
  if (typeof process !== 'undefined' && 
      process !== null && 
      typeof process.on === 'function') {
    try {
      // Handle graceful shutdown in Node.js environments
      process.once('SIGTERM', () => {
        // Clean up all resources when the application is shutting down
        RunCache.shutdown();
      });
      
      // Also handle SIGINT (Ctrl+C) for development environments
      process.once('SIGINT', () => {
        RunCache.shutdown();
        // Only exit if we're in a Node.js process
        if (typeof process.exit === 'function') {
          process.exit(0);
        }
      });
    } catch (e) {
      // Silently handle errors in environments where process events aren't fully supported
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('RunCache: Unable to register process termination handlers', e);
      }
    }
  }

  // Browser environment
  if (typeof window !== 'undefined' && 
      window !== null && 
      typeof window.addEventListener === 'function') {
    try {
      window.addEventListener(
        'beforeunload',
        () => {
          RunCache.shutdown();
        },
        { once: true }
      );
    } catch (e) {
      // Silently handle errors in environments where window events aren't fully supported
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('RunCache: Unable to register window unload handler', e);
      }
    }
  }
}

/**
 * RunCache - A dependency-free, lightweight runtime caching library
 * with TTL support and automatic value regeneration.
 */
export class RunCache {
  private static instance: CacheStore = new CacheStore();

  // Register shutdown handlers when the class is loaded
  static {
    registerShutdownHandlers();
  }

  /**
   * Sets a cache entry with the specified key, value, and optional parameters like TTL (time to live) and auto-refetch behavior.
   *
   * @param {Object} params - The parameters to set in the cache.
   * @param {string} params.key - The key for the cache entry. Must be a non-empty string.
   * @param {string} [params.value] - The value to store in the cache. If not provided, the `sourceFn` must be defined to generate the value.
   * @param {number} [params.ttl] - The time-to-live for the cache entry in milliseconds. After this time, the cache entry will expire.
   * @param {boolean} [params.autoRefetch] - Whether to automatically refetch the value after the TTL expires. Requires a TTL to be set.
   * @param {SourceFn} [params.sourceFn] - A function that returns the value for the cache. This is used when the value is not provided directly.
   *
   * @returns {Promise<boolean>} - Returns `true` when the cache entry is successfully set.
   *
   * @throws {Error} If the key is empty, if both `value` and `sourceFn` are missing, or if `autoRefetch` is set without a TTL.
   * @throws {Error} If `ttl` is negative.
   * @throws {Error} If the `sourceFn` fails to generate a value.
   */
  static async set(params: {
    key: string;
    value?: string;
    ttl?: number;
    autoRefetch?: boolean;
    sourceFn?: SourceFn;
  }): Promise<boolean> {
    return RunCache.instance.set(params);
  }

  /**
   * Refetch the cached value using the stored source function and updates the cache with the new value.
   * Supports wildcard patterns in the key.
   *
   * @param {string} key - The cache key or pattern (with optional wildcard *).
   * @returns {Promise<boolean>} A promise that resolves to a boolean representing the execution state of the request.
   * If a wildcard pattern is used, returns true if any key was successfully refetched.
   */
  static async refetch(key: string): Promise<boolean> {
    return RunCache.instance.refetch(key);
  }

  /**
   * Retrieves a value from the cache by key. If the cached value has expired, it will be removed from the cache unless
   * `autoRefetch` is enabled with an associated `sourceFn`, in which case the value will be refetched automatically.
   * Supports wildcard patterns in the key.
   *
   * @async
   * @param {string} key - The key of the cache entry to retrieve, can include wildcards (*).
   * @returns {Promise<string | string[] | undefined>} 
   * - For exact keys: A string value or undefined if not found/expired
   * - For wildcard keys: An array of matching values or undefined if no matches
   */
  static async get(key: string): Promise<string | string[] | undefined> {
    return RunCache.instance.get(key);
  }

  /**
   * Deletes cache entries matching the specified key or pattern.
   * If the entries have active intervals (for TTL), it clears them.
   *
   * @param {string} key - The key or pattern of cache entries to delete. Supports wildcards (*).
   *
   * @returns {boolean} - Returns `true` if at least one cache entry was successfully deleted, 
   * `false` if no entries exist for the given key/pattern.
   */
  static delete(key: string): boolean {
    return RunCache.instance.delete(key);
  }

  /**
   * Deletes all cache entries and clears any active intervals for TTL.
   * This method iterates over all cache entries, clears any associated intervals, and then clears the entire cache.
   *
   * @returns {void}
   */
  static flush(): void {
    RunCache.instance.flush();
  }

  /**
   * Checks if cache entries exist for the given key/pattern and whether they have expired.
   * Supports wildcard patterns in the key.
   *
   * @param {string} key - The key or pattern of the cache entries to check. Supports wildcards (*).
   * @returns {Promise<boolean>} - A promise that resolves to:
   *  - For exact keys: `true` if the cache entry exists and is not expired, otherwise `false`.
   *  - For wildcard patterns: `true` if ANY matching entry exists and is not expired, otherwise `false`.
   */
  static async has(key: string): Promise<boolean> {
    return RunCache.instance.has(key);
  }

  /**
   * Registers a callback function to be executed when the global `expire` event is triggered.
   *
   * @param {(event: EventParam) => void | Promise<void>} callback - The function to be executed when the event is triggered.
   *
   * @returns {void}
   */
  static onExpiry(callback: (event: EventParam) => void | Promise<void>): void {
    RunCache.instance.onExpiry(callback);
  }

  /**
   * Registers a callback function to be executed when the `expire` event for a specific key is triggered.
   * Supports wildcard patterns in the key.
   *
   * @param {string} key - The key for which the expiration event is being tracked. Supports wildcards (*).
   * @param {(event: EventParam) => void | Promise<void>} callback - The function to be executed when the event is triggered.
   *
   * @returns {void}
   *
   * @throws {Error} If the `key` is empty.
   */
  static onKeyExpiry(key: string, callback: (event: EventParam) => void | Promise<void>): void {
    RunCache.instance.onKeyExpiry(key, callback);
  }

  /**
   * Registers a callback function to be executed when the global `refetch` event is triggered.
   *
   * @param {(event: EventParam) => void | Promise<void>} callback - The function to be executed when the event is triggered.
   *
   * @returns {void}
   */
  static onRefetch(callback: (event: EventParam) => void | Promise<void>): void {
    RunCache.instance.onRefetch(callback);
  }

  /**
   * Registers a callback function to be executed when the `refetch` event for a specific key is triggered.
   * Supports wildcard patterns in the key.
   *
   * @param {string} key - The key for which the refetch event is being tracked. Supports wildcards (*).
   * @param {(event: EventParam) => void | Promise<void>} callback - The function to be executed when the event is triggered.
   *
   * @returns {void}
   *
   * @throws {Error} If the `key` is empty.
   */
  static onKeyRefetch(key: string, callback: (event: EventParam) => void | Promise<void>): void {
    RunCache.instance.onKeyRefetch(key, callback);
  }

  /**
   * Registers a callback to be called when a refetch failure occurs for any key.
   *
   * @param {(event: EventParam) => void | Promise<void>} callback - The function to be executed when a refetch failure event occurs.
   */
  static onRefetchFailure(callback: (event: EventParam) => void | Promise<void>): void {
    RunCache.instance.onRefetchFailure(callback);
  }

  /**
   * Registers a callback to be called when a refetch failure occurs for a specific key.
   * Supports wildcard patterns in the key.
   *
   * @param {string} key - The key for which to listen for refetch failures. Supports wildcards (*).
   * @param {(event: EventParam) => void | Promise<void>} callback - The function to be executed when a refetch failure event occurs for the specified key.
   *
   * @throws {Error} Throws an error if the key is empty.
   */
  static onKeyRefetchFailure(key: string, callback: (event: EventParam) => void | Promise<void>): void {
    RunCache.instance.onKeyRefetchFailure(key, callback);
  }

  /**
   * Clears event listeners from the RunCache emitter based on the specified event and key.
   *
   * - If no parameters are provided, all event listeners will be removed.
   * - If only an `event` is provided, all listeners for that event will be removed.
   * - If both `event` and `key` are provided, listeners for that specific event-key combination will be removed.
   * - Supports wildcard patterns in the key.
   *
   * @param {Object} [params] - Optional parameters to specify which listeners to clear.
   * @param {EventName} [params.event] - The event type for which listeners should be removed.
   * @param {string} [params.key] - The key associated with the event for which listeners should be removed. Must be provided if `event` is provided. Supports wildcards (*).
   *
   * @returns {boolean} - Returns `true` if listeners were removed successfully or `false` if no action was taken.
   *
   * @throws {Error} If `key` is provided without an `event`.
   */
  static clearEventListeners(params?: {
    event?: EventName;
    key?: string;
  }): boolean {
    return RunCache.instance.clearEventListeners(params);
  }

  /**
   * Configures RunCache settings.
   * 
   * @param config Configuration options for RunCache.
   */
  static configure(config: RunCacheConfig): void {
    RunCache.instance.configure(config);
  }

  /**
   * Gets the current RunCache configuration.
   * 
   * @returns Current configuration settings.
   */
  static getConfig(): RunCacheConfig {
    return RunCache.instance.getConfig();
  }
  
  /**
   * Performs a complete shutdown of the cache, cleaning up all resources:
   * - Clears all cache entries and their associated intervals
   * - Removes all event listeners
   * - Resets the cache to its initial state
   * 
   * This method should be called when the application is shutting down to prevent memory leaks.
   */
  static shutdown(): void {
    RunCache.instance.shutdown();
  }
} 