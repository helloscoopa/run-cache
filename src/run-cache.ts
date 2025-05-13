import { CacheStore } from './core/cache-store';
import { CacheConfig, EvictionPolicy } from './types/cache-config';
import { EventParam, EventName, EVENT } from './types/events';
import { SourceFn } from './types/cache-state';
import { MiddlewareFunction } from './types/middleware';
import { StorageAdapter, StorageAdapterConfig } from './types/storage-adapter';

// Re-export needed types for backwards compatibility with tests
export { EvictionPolicy, EVENT, EventParam };

// Re-export storage adapters
export * from './storage/index';

/**
 * Registers shutdown handlers to properly clean up resources when the application is terminated.
 * This ensures the cache is properly cleared to prevent memory leaks.
 * 
 * Handles the following scenarios:
 * - Node.js environment: Registers handlers for SIGTERM and SIGINT signals
 * - Browser environment: Registers handler for beforeunload event
 * 
 * @private
 */
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
 * 
 * Features:
 * - Simple key-value storage with string values
 * - TTL (time-to-live) support for automatic expiration
 * - Automatic refetching of expired values using source functions
 * - Event system for monitoring cache operations
 * - Wildcard key pattern support for batch operations
 * - Support for multiple eviction policies (NONE, LRU, LFU)
 * - Compatible with both Node.js and browser environments
 * - Optional persistent storage through adapters (localStorage, IndexedDB, or filesystem)
 * 
 * @example
 * // Basic usage
 * await RunCache.set({ key: "user:123", value: "John Doe", ttl: 60000 });
 * const user = await RunCache.get("user:123");
 * 
 * @example
 * // With auto-refetch
 * await RunCache.set({
 *   key: "user:123",
 *   sourceFn: async () => getUserFromAPI(123),
 *   ttl: 60000,
 *   autoRefetch: true
 * });
 * 
 * @example
 * // With persistent storage
 * // First, import the storage adapter
 * import { RunCache, LocalStorageAdapter } from 'run-cache';
 * 
 * // Configure RunCache with a storage adapter
 * RunCache.configure({
 *   storageAdapter: new LocalStorageAdapter({ storageKey: "my-app-cache" })
 * });
 */
export class RunCache {
  private static instance: CacheStore;
  private static instancePromise: Promise<CacheStore> | null = null;
  private static isInitialized = false;

  // Register shutdown handlers when the class is loaded
  static {
    registerShutdownHandlers();
    // Initialize the cache store
    RunCache.initialize();
  }

  /**
   * Initializes the RunCache instance. 
   * This is automatically called when the class is loaded.
   * @private
   */
  private static async initialize() {
    if (!RunCache.instancePromise) {
      RunCache.instancePromise = CacheStore.create();
      try {
        RunCache.instance = await RunCache.instancePromise;
        RunCache.isInitialized = true;
      } catch (error) {
        console.error('Failed to initialize RunCache:', error);
        // Log the error but don't create a new instance as the constructor is private
        // The error will propagate to methods that try to use RunCache before it's initialized
        throw new Error('Failed to initialize RunCache storage');
      }
    }
    return RunCache.instance;
  }

  /**
   * Ensures the RunCache is initialized before accessing it.
   * @private
   */
  private static async ensureInitialized() {
    if (!RunCache.isInitialized) {
      await RunCache.initialize();
    }
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
   * @param {string[]} [params.tags] - Optional array of tags to assign to this cache entry for tag-based invalidation.
   * @param {string[]} [params.dependencies] - Optional array of cache keys that this entry depends on for dependency-based invalidation.
   *
   * @returns {Promise<boolean>} - Returns `true` when the cache entry is successfully set.
   *
   * @throws {Error} If the key is empty, if both `value` and `sourceFn` are missing, or if `autoRefetch` is set without a TTL.
   * @throws {Error} If `ttl` is negative.
   * @throws {Error} If the `sourceFn` fails to generate a value.
   * 
   * @example
   * // Basic usage with tags
   * await RunCache.set({ 
   *   key: "user:profile:123", 
   *   value: JSON.stringify({name: "John"}), 
   *   tags: ["user:123", "profile"]
   * });
   * 
   * @example
   * // With dependencies
   * await RunCache.set({
   *   key: "user:dashboard:123",
   *   value: dashboardData,
   *   dependencies: ["user:profile:123", "user:stats:123"]
   * });
   */
  static async set(params: {
    key: string;
    value?: string;
    ttl?: number;
    autoRefetch?: boolean;
    sourceFn?: SourceFn;
    tags?: string[];
    dependencies?: string[];
  }): Promise<boolean> {
    await RunCache.ensureInitialized();
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
    await RunCache.ensureInitialized();
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
    await RunCache.ensureInitialized();
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
  static async delete(key: string): Promise<boolean> {
    await RunCache.ensureInitialized();
    return RunCache.instance.delete(key);
  }

  /**
   * Deletes all cache entries and clears any active intervals for TTL.
   * This method iterates over all cache entries, clears any associated intervals, and then clears the entire cache.
   *
   * @returns {void}
   */
  static async flush(): Promise<void> {
    await RunCache.ensureInitialized();
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
    await RunCache.ensureInitialized();
    return RunCache.instance.has(key);
  }

  /**
   * Registers a callback function to be executed when the global `expire` event is triggered.
   *
   * @param {(event: EventParam) => void | Promise<void>} callback - The function to be executed when the event is triggered.
   *
   * @returns {void}
   */
  static async onExpiry(callback: (event: EventParam) => void | Promise<void>): Promise<void> {
    await RunCache.ensureInitialized();
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
  static async onKeyExpiry(key: string, callback: (event: EventParam) => void | Promise<void>): Promise<void> {
    await RunCache.ensureInitialized();
    RunCache.instance.onKeyExpiry(key, callback);
  }

  /**
   * Registers a callback function to be executed when the global `refetch` event is triggered.
   *
   * @param {(event: EventParam) => void | Promise<void>} callback - The function to be executed when the event is triggered.
   *
   * @returns {void}
   */
  static async onRefetch(callback: (event: EventParam) => void | Promise<void>): Promise<void> {
    await RunCache.ensureInitialized();
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
  static async onKeyRefetch(key: string, callback: (event: EventParam) => void | Promise<void>): Promise<void> {
    await RunCache.ensureInitialized();
    RunCache.instance.onKeyRefetch(key, callback);
  }

  /**
   * Registers a callback function to be executed when the global `refetch_failure` event is triggered.
   * 
   * @param {(event: EventParam) => void | Promise<void>} callback - The function to be executed when the event is triggered.
   * 
   * @returns {void}
   */
  static async onRefetchFailure(callback: (event: EventParam) => void | Promise<void>): Promise<void> {
    await RunCache.ensureInitialized();
    RunCache.instance.onRefetchFailure(callback);
  }

  /**
   * Registers a callback function to be executed when the `refetch_failure` event for a specific key is triggered.
   * Supports wildcard patterns in the key.
   * 
   * @param {string} key - The key for which the refetch failure event is being tracked. Supports wildcards (*).
   * @param {(event: EventParam) => void | Promise<void>} callback - The function to be executed when the event is triggered.
   * 
   * @returns {void}
   */
  static async onKeyRefetchFailure(key: string, callback: (event: EventParam) => void | Promise<void>): Promise<void> {
    await RunCache.ensureInitialized();
    RunCache.instance.onKeyRefetchFailure(key, callback);
  }

  /**
   * Clears event listeners for a specific event type and/or key.
   * If no parameters are provided, clears all event listeners.
   * If only event is provided, clears all listeners for that event.
   * If only key is provided, clears all event listeners for that key.
   * If both event and key are provided, clears only listeners for that specific combination.
   * 
   * @param {Object} [params] - Optional parameters to specify which event listeners to clear.
   * @param {EventName} [params.event] - Optional event name to clear listeners for.
   * @param {string} [params.key] - Optional key to clear listeners for.
   * 
   * @returns {boolean} - Returns `true` if any listeners were cleared, `false` otherwise.
   */
  static async clearEventListeners(params?: {
    event?: EventName;
    key?: string;
  }): Promise<boolean> {
    await RunCache.ensureInitialized();
    return RunCache.instance.clearEventListeners(params);
  }

  /**
   * Configures RunCache settings.
   * 
   * @param {CacheConfig} config - Configuration options for RunCache:
   *   - maxEntries: Maximum number of entries the cache can hold before eviction occurs (default: Infinity)
   *   - evictionPolicy: The eviction policy to use when the cache exceeds its maximum size (default: EvictionPolicy.NONE)
   *   - debug: Enable debug logging (default: false)
   *   - storageAdapter: Optional adapter for persisting cache data (default: undefined)
   */
  static async configure(config: CacheConfig): Promise<void> {
    await RunCache.ensureInitialized();
    await RunCache.instance.configure(config);
  }

  /**
   * Gets the current RunCache configuration.
   * 
   * @returns {CacheConfig} Current configuration settings with the following properties:
   *   - maxEntries: Maximum number of entries the cache can hold
   *   - evictionPolicy: The current eviction policy
   *   - debug: Whether debug logging is enabled
   */
  static async getConfig(): Promise<CacheConfig> {
    await RunCache.ensureInitialized();
    return RunCache.instance.getConfig();
  }
  
  /**
   * Performs a complete shutdown of the cache, cleaning up all resources:
   * - Clears all cache entries and their associated intervals
   * - Removes all event listeners
   * - Resets the cache to its initial state
   */
  static async shutdown(): Promise<void> {
    if (RunCache.isInitialized) {
      await RunCache.instance.shutdown();
      
      // Reset configuration to default values
      await RunCache.configure({
        maxEntries: Number.POSITIVE_INFINITY,
        evictionPolicy: EvictionPolicy.NONE,
        debug: false,
        storageAdapter: undefined
      });
    }
    // Reset initialization state
    RunCache.isInitialized = false;
    RunCache.instancePromise = null;
  }

  /**
   * Adds a middleware function to the cache processing pipeline.
   * Middleware functions can intercept, validate, modify, or transform cache values
   * during operations like get, set, and refetch.
   * 
   * Each middleware function is called in the order they were added.
   */
  static async use(middleware: MiddlewareFunction) {
    await RunCache.ensureInitialized();
    return RunCache.instance.use(middleware);
  }

  /**
   * Clears all registered middleware functions.
   * This effectively disables any custom transformations that were previously applied.
   */
  static async clearMiddleware() {
    await RunCache.ensureInitialized();
    return RunCache.instance.clearMiddleware();
  }

  /**
   * Invalidates all cache entries that have been tagged with the specified tag.
   * This allows for efficient group-based invalidation of related cache entries.
   * 
   * @param {string} tag - The tag to invalidate. All cache entries with this tag will be removed.
   * @returns {boolean} - Returns `true` if at least one cache entry was invalidated, `false` otherwise.
   */
  static async invalidateByTag(tag: string): Promise<boolean> {
    await RunCache.ensureInitialized();
    return RunCache.instance.invalidateByTag(tag);
  }

  /**
   * Invalidates all cache entries that depend on the specified key.
   * This creates a cascading invalidation effect for related cache data.
   * 
   * @param {string} key - The key that entries may depend on. All entries listing this key as a dependency will be removed.
   * @returns {boolean} - Returns `true` if at least one cache entry was invalidated, `false` otherwise.
   */
  static async invalidateByDependency(key: string): Promise<boolean> {
    await RunCache.ensureInitialized();
    return RunCache.instance.invalidateByDependency(key);
  }

  /**
   * Checks if the target key depends on the specified dependency key.
   * Useful for verifying dependency relationships in the cache.
   * 
   * @param {string} targetKey - The key to check for dependencies
   * @param {string} dependencyKey - The dependency key to look for
   * @returns {Promise<boolean>} - Returns `true` if targetKey depends on dependencyKey, `false` otherwise
   */
  static async isDependencyOf(targetKey: string, dependencyKey: string): Promise<boolean> {
    await RunCache.ensureInitialized();
    return RunCache.instance.isDependencyOf(targetKey, dependencyKey);
  }

  /**
   * Registers a callback function to be executed when the global `tag_invalidation` event is triggered.
   * This event occurs when cache entries are invalidated using a tag.
   * 
   * @param {(event: EventParam) => void | Promise<void>} callback - The function to be executed when the event is triggered.
   */
  static async onTagInvalidation(callback: (event: EventParam) => void | Promise<void>): Promise<void> {
    await RunCache.ensureInitialized();
    RunCache.instance.onTagInvalidation(callback);
  }

  /**
   * Registers a callback function to be executed when the `tag_invalidation` event for a specific key is triggered.
   * Supports wildcard patterns in the key.
   * 
   * @param {string} key - The key for which the tag invalidation event is being tracked. Supports wildcards (*).
   * @param {(event: EventParam) => void | Promise<void>} callback - The function to be executed when the event is triggered.
   */
  static async onKeyTagInvalidation(key: string, callback: (event: EventParam) => void | Promise<void>): Promise<void> {
    await RunCache.ensureInitialized();
    RunCache.instance.onKeyTagInvalidation(key, callback);
  }

  /**
   * Registers a callback function to be executed when the global `dependency_invalidation` event is triggered.
   * This event occurs when cache entries are invalidated due to dependency relationships.
   * 
   * @param {(event: EventParam) => void | Promise<void>} callback - The function to be executed when the event is triggered.
   */
  static async onDependencyInvalidation(callback: (event: EventParam) => void | Promise<void>): Promise<void> {
    await RunCache.ensureInitialized();
    RunCache.instance.onDependencyInvalidation(callback);
  }

  /**
   * Registers a callback function to be executed when the `dependency_invalidation` event for a specific key is triggered.
   * Supports wildcard patterns in the key.
   * 
   * @param {string} key - The key for which the dependency invalidation event is being tracked. Supports wildcards (*).
   * @param {(event: EventParam) => void | Promise<void>} callback - The function to be executed when the event is triggered.
   */
  static async onKeyDependencyInvalidation(key: string, callback: (event: EventParam) => void | Promise<void>): Promise<void> {
    await RunCache.ensureInitialized();
    RunCache.instance.onKeyDependencyInvalidation(key, callback);
  }

  /**
   * Sets up auto-save interval for persistent storage
   * @param intervalMs Milliseconds between auto-saves, or 0 to disable
   */
  static async setupAutoSave(intervalMs: number): Promise<void> {
    await RunCache.ensureInitialized();
    RunCache.instance.setupAutoSave(intervalMs);
  }

  /**
   * Manually saves the current cache state to the configured storage adapter
   * @returns Promise that resolves to true if saved successfully
   */
  static async saveToStorage(): Promise<boolean> {
    await RunCache.ensureInitialized();
    return RunCache.instance.saveToStorage();
  }

  /**
   * Manually loads cache state from the configured storage adapter
   * @returns Promise that resolves to true if loaded successfully
   */
  static async loadFromStorage(): Promise<boolean> {
    await RunCache.ensureInitialized();
    return RunCache.instance.loadFromStorage();
  }
} 