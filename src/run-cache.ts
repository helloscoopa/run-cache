import { EventEmitter } from "node:events";

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
}

type CacheState = {
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

export type EventParam = {
  key: string;
  value: string;
  ttl?: number;
  createdAt: number;
  updatedAt: number;
};

type EmitParam = Pick<
  CacheState,
  "value" | "ttl" | "createdAt" | "updatedAt"
> & {
  key: string;
};

export const EVENT = Object.freeze({
  EXPIRE: "expire",
  REFETCH: "refetch",
  REFETCH_FAILURE: "refetch-failure",
});

type EventName = (typeof EVENT)[keyof typeof EVENT];

type SourceFn = () => Promise<string> | string;
type EventFn = (params: EventParam) => Promise<void> | void;

export { RunCache };

// Register a shutdown handler to clean up resources when the application terminates
// This is only available in Node.js environments
if (typeof process !== 'undefined' && 
    process !== null && 
    typeof process.on === 'function') {
  try {
    // Handle graceful shutdown in Node.js environments
    process.on('SIGTERM', () => {
      // Clean up all resources when the application is shutting down
      RunCache.shutdown();
    });
    
    // Also handle SIGINT (Ctrl+C) for development environments
    process.on('SIGINT', () => {
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

// In browser environments, try to use the beforeunload event if available
if (typeof window !== 'undefined' && 
    window !== null && 
    typeof window.addEventListener === 'function') {
  try {
    window.addEventListener('beforeunload', () => {
      RunCache.shutdown();
    });
  } catch (e) {
    // Silently handle errors in environments where window events aren't fully supported
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('RunCache: Unable to register window unload handler', e);
    }
  }
}

class RunCache {
  private static cache: Map<string, CacheState> = new Map<string, CacheState>();
  private static emitter: EventEmitter = new EventEmitter();
  
  // Track wildcard listeners for proper cleanup
  private static _wildcardListeners: Array<{
    event: EventName;
    keyPattern: string;
    fn: EventFn;
  }> = [];
  
  // Cache configuration
  private static config: RunCacheConfig = {
    maxSize: Number.POSITIVE_INFINITY,
    evictionPolicy: EvictionPolicy.NONE,
  };

  private static isExpired(cache: CacheState): boolean {
    if (!cache.ttl) return false;

    return cache.updatedAt + cache.ttl < Date.now();
  }

  /**
   * Utility function to check if a key matches a pattern (supporting wildcards)
   * @param pattern The pattern to match against (can include * wildcard)
   * @param key The key to check
   * @returns boolean indicating if the key matches the pattern
   */
  private static matchesPattern(pattern: string, key: string): boolean {
    if (!pattern.includes("*")) {
      return pattern === key;
    }
    
    // Escape all RegExp metacharacters **except** the wildcard `*`
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")   // escape meta
      .replace(/\\\*/g, "*");                  // unescape *
    
    // Replace * with .* for wildcard matching
    const regexPattern = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
    return regexPattern.test(key);
  }

  /**
   * Gets all keys that match a pattern
   * @param pattern The pattern to match (can include * wildcard)
   * @returns Array of matching keys
   */
  private static getMatchingKeys(pattern: string): string[] {
    if (!pattern.includes("*")) {
      return RunCache.cache.has(pattern) ? [pattern] : [];
    }

    const matchingKeys: string[] = [];
    // Take a snapshot of all keys to avoid concurrent modification issues
    const allKeys = Array.from(RunCache.cache.keys());
    for (const cacheKey of allKeys) {
      if (RunCache.matchesPattern(pattern, cacheKey)) {
        matchingKeys.push(cacheKey);
      }
    }
    return matchingKeys;
  }

  /**
   * Updates the access metadata for a specific cache entry.
   * @param key The cache key to update
   */
  private static updateAccessMetadata(key: string): void {
    const cached = RunCache.cache.get(key);
    if (cached) {
      // Use the current timestamp for the update
      const now = Date.now();
      cached.lastAccessed = now;
      cached.accessCount += 1;
      RunCache.cache.set(key, cached);
    }
    RunCache.enforceEvictionPolicy();
  }

  /**
   * Checks if cache eviction is needed based on the current configuration.
   * If necessary, evicts entries according to the configured policy.
   */
  private static enforceEvictionPolicy(): void {
    // Skip if the cache isn't full yet
    if (RunCache.cache.size <= (RunCache.config.maxSize ?? Number.POSITIVE_INFINITY)) {
      return;
    }

    // Number of entries to evict
    const entriesToEvict = RunCache.cache.size - (RunCache.config.maxSize ?? Number.POSITIVE_INFINITY);
    
    if (entriesToEvict <= 0) {
      return;
    }

    // Choose eviction strategy based on configuration
    switch (RunCache.config.evictionPolicy) {
      case EvictionPolicy.LRU:
        RunCache.evictLRU(entriesToEvict);
        break;
      case EvictionPolicy.LFU:
        RunCache.evictLFU(entriesToEvict);
        break;
      case EvictionPolicy.NONE:
      default:
        // No automatic eviction
        break;
    }
  }

  /**
   * Evicts the least recently used entries from the cache.
   * @param count Number of entries to evict
   */
  private static evictLRU(count: number): void {
    // Create a sorted array based on LRU criteria
    const entries = Array.from(RunCache.cache.entries())
      .map(([key, state]) => [key, state] as [string, CacheState])
      .sort((a, b) => {
        const [, stateA] = a;
        const [, stateB] = b;
        
        // First sort by access count - items that were never accessed get evicted first
        if (stateA.accessCount === 0 && stateB.accessCount > 0) {
          return -1; // A comes first (should be evicted)
        }
        if (stateA.accessCount > 0 && stateB.accessCount === 0) {
          return 1; // B comes first (should be evicted)
        }
        
        // If both items have the same access counts, sort by last accessed time
        if (stateA.lastAccessed === stateB.lastAccessed) {
          // Sort by creation time if last accessed times are identical
          return stateA.createdAt - stateB.createdAt;
        }
        
        // Otherwise just sort by lastAccessed time (oldest first)
        return stateA.lastAccessed - stateB.lastAccessed;
      });
    
    // Take the oldest 'count' entries
    const toEvict = entries.slice(0, count).map(([key]) => key);
    
    // Evict them from the cache
    for (const key of toEvict) {
      RunCache.deleteSingle(key);
    }
  }

  /**
   * Evicts the least frequently used entries from the cache.
   * @param count Number of entries to evict
   */
  private static evictLFU(count: number): void {
    // Create a sorted array based on LFU criteria
    const entries = Array.from(RunCache.cache.entries())
      .map(([key, state]) => [key, state] as [string, CacheState])
      .sort((a, b) => {
        const [, stateA] = a;
        const [, stateB] = b;
        
        // First sort by accessCount (lowest first)
        if (stateA.accessCount !== stateB.accessCount) {
          return stateA.accessCount - stateB.accessCount;
        }
        
        // If accessCount is the same, sort by createdAt (oldest first)
        // This ensures deterministic behavior when entries have the same frequency
        return stateA.createdAt - stateB.createdAt;
      });
    
    // Take the least frequently accessed 'count' entries
    const toEvict = entries.slice(0, count).map(([key]) => key);
    
    // Evict them from the cache
    for (const key of toEvict) {
      RunCache.deleteSingle(key);
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
   *
   * @returns {Promise<boolean>} - Returns `true` when the cache entry is successfully set.
   *
   * @throws {Error} If the key is empty, if both `value` and `sourceFn` are missing, or if `autoRefetch` is set without a TTL.
   * @throws {Error} If `ttl` is negative.
   * @throws {Error} If the `sourceFn` fails to generate a value.
   */
  static async set({
    key,
    value,
    ttl,
    sourceFn,
    autoRefetch,
  }: {
    key: string;
    value?: string;
    ttl?: number;
    autoRefetch?: boolean;
    sourceFn?: SourceFn;
  }): Promise<boolean> {
    if (!key?.length) {
      throw new Error("Empty key");
    }

    if (sourceFn === undefined && (value === undefined || !value.length)) {
      throw new Error("`value` can't be empty without a `sourceFn`");
    }

    if (autoRefetch && !ttl) {
      throw new Error("`autoRefetch` is not allowed without a `ttl`");
    }

    const time = Date.now();

    // Clear existing interval if the key already exists
    const existingCache = RunCache.cache.get(key);
    if (existingCache?.interval) {
      clearInterval(existingCache.interval);
    }

    let interval: ReturnType<typeof setInterval> | null = null;

    if (ttl !== undefined) {
      if (ttl < 0) throw new Error("Value `ttl` cannot be negative");

      interval = setInterval(() => {
        RunCache.emitEvent(EVENT.EXPIRE, {
          key,
          value: value ?? "undefined",
          ttl,
          createdAt: time,
          updatedAt: time,
        });

        if (typeof sourceFn === "function" && autoRefetch) {
          RunCache.refetch(key).catch((e) => {
            /* Ignore as the event is already emitted inside the function */
          });
        }
      }, ttl);
    }

    let cacheValue = value;

    if (value === undefined && typeof sourceFn === "function") {
      try {
        cacheValue = await sourceFn();
      } catch (e) {
        throw new Error(`Source function failed for key: '${key}'`);
      }
    }

    // Check if adding this entry will exceed max size and enforce eviction if needed
    // Do this check BEFORE adding the new entry to ensure proper eviction
    if (RunCache.cache.size >= (RunCache.config.maxSize ?? Number.POSITIVE_INFINITY) &&
        !RunCache.cache.has(key) &&
        RunCache.config.evictionPolicy !== EvictionPolicy.NONE) {
      // We're adding a new key and we're already at max size, so evict one
      if (RunCache.config.evictionPolicy === EvictionPolicy.LRU) {
        RunCache.evictLRU(1);
      } else if (RunCache.config.evictionPolicy === EvictionPolicy.LFU) {
        RunCache.evictLFU(1);
      }
    }

    // Set up proper access metadata - preserve existing metadata for updates
    const accessCount = existingCache ? existingCache.accessCount : 0;
    const lastAccessed = existingCache ? existingCache.lastAccessed : time;

    RunCache.cache.set(key, {
      value: cacheValue ?? "undefined",
      ttl,
      sourceFn,
      autoRefetch,
      interval: interval || undefined,
      createdAt: time,
      updatedAt: time,
      // Initialize access metadata for eviction policies
      accessCount,
      lastAccessed,
    });

    // Double-check after adding to ensure we're not over the limit
    RunCache.enforceEvictionPolicy();
    return true;
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
    // Handle wildcard patterns
    if (key.includes("*")) {
      const matchingKeys = RunCache.getMatchingKeys(key);
      if (matchingKeys.length === 0) {
        return false;
      }

      // Attempt to refetch all matching keys
      const results = await Promise.all(
        matchingKeys.map(async (matchedKey) => {
          try {
            return await RunCache.refetchSingle(matchedKey);
          } catch (e) {
            // If one key fails, we still want to try the others
            return false;
          }
        })
      );

      // Return true if any refetch was successful
      return results.some(result => result === true);
    }

    // Handle single key
    return RunCache.refetchSingle(key);
  }

  /**
   * Helper method to refetch a single key
   * @param key The exact key to refetch
   * @returns Promise<boolean> indicating success
   */
  private static async refetchSingle(key: string): Promise<boolean> {
    const cached = RunCache.cache.get(key);

    if (!cached) {
      return false;
    }

    if (typeof cached.sourceFn === "undefined") {
      return false;
    }

    if (cached.fetching) {
      return false;
    }

    try {
      RunCache.cache.set(key, { fetching: true, ...cached });

      const value = await cached.sourceFn();

      const refetchedCache = {
        value: value,
        ttl: cached.ttl,
        sourceFn: cached.sourceFn,
        createdAt: cached.createdAt,
        updatedAt: Date.now(),
        accessCount: cached.accessCount + 1,
        lastAccessed: Date.now(),
      };

      RunCache.cache.set(key, {
        ...refetchedCache,
        fetching: undefined,
      });

      RunCache.emitEvent(EVENT.REFETCH, {
        key,
        value: refetchedCache.value,
        ttl: refetchedCache.ttl,
        createdAt: refetchedCache.createdAt,
        updatedAt: refetchedCache.updatedAt,
      });

      return true;
    } catch (e) {
      RunCache.cache.set(key, {
        ...cached,
        fetching: undefined,
      });

      RunCache.emitEvent(EVENT.REFETCH_FAILURE, {
        key,
        value: cached.value,
        ttl: cached.ttl,
        createdAt: cached.createdAt,
        updatedAt: cached.updatedAt,
      });

      throw new Error(`Source function failed for key: '${key}'`);
    }
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
    if (!key) {
      return undefined;
    }

    const isWildcard = key.includes("*");

    // If wildcard is present, fetch all matching keys
    if (isWildcard) {
      const matchingValues: string[] = [];

      // Take a snapshot first to avoid concurrent modification issues
      // This prevents problems if enforceEvictionPolicy() is called during iteration
      const snapshot = Array.from(RunCache.cache.entries());
      for (const [cacheKey, cached] of snapshot) {
        if (RunCache.matchesPattern(key, cacheKey) && !RunCache.isExpired(cached)) {
          // Update access metadata for the matched key
          RunCache.updateAccessMetadata(cacheKey);
          matchingValues.push(cached.value);
        }
      }

      return matchingValues.length > 0 ? matchingValues : undefined;
    }

    // Handle exact key match
    const cached = RunCache.cache.get(key);

    if (!cached) {
      return undefined;
    }

    if (!RunCache.isExpired(cached)) {
      // Update access metadata for LRU/LFU
      RunCache.updateAccessMetadata(key);
      return cached.value;
    }

    RunCache.emitEvent(EVENT.EXPIRE, {
      key: key,
      value: cached.value,
      ttl: cached.ttl,
      createdAt: cached.createdAt,
      updatedAt: cached.updatedAt,
    });

    if (typeof cached.sourceFn === "undefined" || !cached.autoRefetch) {
      RunCache.cache.delete(key);
      return undefined;
    }

    await RunCache.refetchSingle(key);
    
    // Update access metadata after refetch
    const refetched = RunCache.cache.get(key);
    if (refetched) {
      RunCache.updateAccessMetadata(key);
      return refetched.value;
    }
    
    return undefined;
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
    if (key.includes("*")) {
      const matchingKeys = RunCache.getMatchingKeys(key);
      if (matchingKeys.length === 0) {
        return false;
      }

      let anyDeleted = false;
      for (const matchedKey of matchingKeys) {
        const deleted = RunCache.deleteSingle(matchedKey);
        anyDeleted = anyDeleted || deleted;
      }
      return anyDeleted;
    }

    return RunCache.deleteSingle(key);
  }

  /**
   * Helper method to delete a single key
   * @param key The exact key to delete
   * @returns boolean indicating if deletion was successful
   */
  private static deleteSingle(key: string): boolean {
    const cache = RunCache.cache.get(key);
    if (!cache) return false;

    if (cache.interval) {
      clearInterval(cache.interval);
    }

    return RunCache.cache.delete(key);
  }

  /**
   * Deletes all cache entries and clears any active intervals for TTL.
   * This method iterates over all cache entries, clears any associated intervals, and then clears the entire cache.
   *
   * @returns {void}
   */
  static flush(): void {
    const values = Array.from(RunCache.cache.values());

    values.forEach(({ interval }) => {
      if (interval) {
        clearInterval(interval);
      }
    });

    RunCache.cache.clear();
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
    if (key.includes("*")) {
      const matchingKeys = RunCache.getMatchingKeys(key);
      
      for (const matchedKey of matchingKeys) {
        const exists = await RunCache.hasSingle(matchedKey);
        if (exists) {
          return true;
        }
      }
      
      return false;
    }

    return RunCache.hasSingle(key);
  }

  /**
   * Helper method to check existence of a single key
   * @param key The exact key to check
   * @returns Promise<boolean> indicating if the key exists and is not expired
   */
  private static async hasSingle(key: string): Promise<boolean> {
    const cached = RunCache.cache.get(key);

    if (!cached) {
      return false;
    }

    if (RunCache.isExpired(cached)) {
      RunCache.emitEvent(EVENT.EXPIRE, {
        key: key,
        value: cached.value,
        ttl: cached.ttl,
        createdAt: cached.createdAt,
        updatedAt: cached.updatedAt,
      });

      return false;
    }
    
    // Update access metadata for LRU/LFU
    RunCache.updateAccessMetadata(key);
    return true;
  }

  private static emitEvent(event: EventName, cache: EmitParam) {
    [event, `${event}-${cache.key}`].forEach((eventId) => {
      RunCache.emitter.emit(eventId, {
        key: cache.key,
        value: cache.value,
        ttl: cache.ttl,
        createdAt: cache.createdAt,
        updatedAt: cache.updatedAt,
      });
    });
  }

  /**
   * Registers a callback function to be executed when the global `expire` event is triggered.
   *
   * @param {EventFn} callback - The function to be executed when the event is triggered.
   *
   * @returns {void}
   */
  static onExpiry(callback: EventFn): void {
    RunCache.emitter.on(EVENT.EXPIRE, callback);
  }

  /**
   * Registers a callback function to be executed when the `expire` event for a specific key is triggered.
   * Supports wildcard patterns in the key.
   *
   * @param {string} key - The key for which the expiration event is being tracked. Supports wildcards (*).
   * @param {EventFn} callback - The function to be executed when the event is triggered.
   *
   * @returns {void}
   *
   * @throws {Error} If the `key` is empty.
   */
  static onKeyExpiry(key: string, callback: EventFn): void {
    if (!key) throw Error("Empty key");

    if (key.includes("*")) {
      // For wildcard patterns, create a wrapper function that filters events
      const wrapper: EventFn = (params: EventParam) => {
        if (RunCache.matchesPattern(key, params.key)) {
          callback(params);
        }
      };
      
      // Attach the wrapper to the root event
      RunCache.emitter.on(EVENT.EXPIRE, wrapper);
      
      // Store the reference for later cleanup
      RunCache._wildcardListeners.push({
        event: EVENT.EXPIRE,
        keyPattern: key,
        fn: wrapper,
      });
    } else {
      RunCache.emitter.on(`${EVENT.EXPIRE}-${key}`, callback);
    }
  }

  /**
   * Registers a callback function to be executed when the global `refetch` event is triggered.
   *
   * @param {EventFn} callback - The function to be executed when the event is triggered.
   *
   * @returns {void}
   */
  static onRefetch(callback: EventFn): void {
    RunCache.emitter.on(EVENT.REFETCH, callback);
  }

  /**
   * Registers a callback function to be executed when the `refetch` event for a specific key is triggered.
   * Supports wildcard patterns in the key.
   *
   * @param {string} key - The key for which the refetch event is being tracked. Supports wildcards (*).
   * @param {EventFn} callback - The function to be executed when the event is triggered.
   *
   * @returns {void}
   *
   * @throws {Error} If the `key` is empty.
   */
  static onKeyRefetch(key: string, callback: EventFn): void {
    if (!key) throw Error("Empty key");

    if (key.includes("*")) {
      // For wildcard patterns, create a wrapper function that filters events
      const wrapper: EventFn = (params: EventParam) => {
        if (RunCache.matchesPattern(key, params.key)) {
          callback(params);
        }
      };
      
      // Attach the wrapper to the root event
      RunCache.emitter.on(EVENT.REFETCH, wrapper);
      
      // Store the reference for later cleanup
      RunCache._wildcardListeners.push({
        event: EVENT.REFETCH,
        keyPattern: key,
        fn: wrapper,
      });
    } else {
      RunCache.emitter.on(`${EVENT.REFETCH}-${key}`, callback);
    }
  }

  /**
   * Registers a callback to be called when a refetch failure occurs for any key.
   *
   * @param {EventFn} callback - The function to be executed when a refetch failure event occurs.
   */
  static onRefetchFailure(callback: EventFn): void {
    RunCache.emitter.on(`${EVENT.REFETCH_FAILURE}`, callback);
  }

  /**
   * Registers a callback to be called when a refetch failure occurs for a specific key.
   * Supports wildcard patterns in the key.
   *
   * @param {string} key - The key for which to listen for refetch failures. Supports wildcards (*).
   * @param {EventFn} callback - The function to be executed when a refetch failure event occurs for the specified key.
   *
   * @throws {Error} Throws an error if the key is empty.
   */
  static onKeyRefetchFailure(key: string, callback: EventFn): void {
    if (!key) throw Error("Empty key");

    if (key.includes("*")) {
      // For wildcard patterns, create a wrapper function that filters events
      const wrapper: EventFn = (params: EventParam) => {
        if (RunCache.matchesPattern(key, params.key)) {
          callback(params);
        }
      };
      
      // Attach the wrapper to the root event
      RunCache.emitter.on(EVENT.REFETCH_FAILURE, wrapper);
      
      // Store the reference for later cleanup
      RunCache._wildcardListeners.push({
        event: EVENT.REFETCH_FAILURE,
        keyPattern: key,
        fn: wrapper,
      });
    } else {
      RunCache.emitter.on(`${EVENT.REFETCH_FAILURE}-${key}`, callback);
    }
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
    if (!params) {
      RunCache.emitter.removeAllListeners();
      RunCache._wildcardListeners = [];
      return true;
    }

    if (params.key && !params.event) {
      throw Error("`key` cannot be provided without `event`");
    }

    if (params.event && params.key) {
      if (params.key.includes("*")) {
        // 1) Remove namespaced listeners
        const prefix = `${params.event}-`;
        for (const eventName of RunCache.emitter.eventNames()) {
          if (typeof eventName === "string" && eventName.startsWith(prefix)) {
            const eventKey = eventName.slice(prefix.length);
            if (RunCache.matchesPattern(params.key, eventKey)) {
              RunCache.emitter.removeAllListeners(eventName);
            }
          }
        }
        
        // 2) Remove wildcard wrappers
        const remaining: typeof RunCache._wildcardListeners = [];
        for (const entry of RunCache._wildcardListeners) {
          if (
            entry.event === params.event &&
            RunCache.matchesPattern(params.key, entry.keyPattern)
          ) {
            RunCache.emitter.removeListener(entry.event, entry.fn);
          } else {
            remaining.push(entry);
          }
        }
        RunCache._wildcardListeners = remaining;
      } else {
        RunCache.emitter.removeAllListeners(`${params.event}-${params.key}`);
      }
      return true;
    }

    if (params.event) {
      RunCache.emitter.removeAllListeners(params.event);

      // Remove all namespaced events
      RunCache.emitter.eventNames().forEach((eventName) => {
        if (
          params.event &&
          typeof eventName === "string" &&
          eventName.startsWith(params.event)
        ) {
          RunCache.emitter.removeAllListeners(eventName);
        }
      });
      
      // Remove all wildcard listeners for this event
      const remaining: typeof RunCache._wildcardListeners = [];
      for (const entry of RunCache._wildcardListeners) {
        if (entry.event === params.event) {
          // Already removed by removeAllListeners(params.event) above
        } else {
          remaining.push(entry);
        }
      }
      RunCache._wildcardListeners = remaining;

      return true;
    }

    return false;
  }

  /**
   * Configures RunCache settings.
   * 
   * @param config Configuration options for RunCache.
   */
  static configure(config: RunCacheConfig): void {
    RunCache.config = { ...RunCache.config, ...config };
  }

  /**
   * Gets the current RunCache configuration.
   * 
   * @returns Current configuration settings.
   */
  static getConfig(): RunCacheConfig {
    return { ...RunCache.config };
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
    // Clear all cache entries and their intervals
    RunCache.flush();
    
    // Remove all event listeners
    RunCache.clearEventListeners();
    
    // Reset configuration to defaults
    RunCache.config = {
      maxSize: Number.POSITIVE_INFINITY,
      evictionPolicy: EvictionPolicy.NONE,
    };
    
    // Log shutdown completion if in a Node.js environment with a console
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('RunCache: shutdown complete, all resources released');
    }
  }
}
