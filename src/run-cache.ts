import { EventEmitter } from "node:events";

type CacheState = {
  value: string;
  createdAt: number;
  updatedAt: number;
  ttl?: number;
  autoRefetch?: boolean;
  fetching?: boolean;
  sourceFn?: SourceFn;
  interval?: ReturnType<typeof setInterval>;
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

class RunCache {
  private static cache: Map<string, CacheState> = new Map<string, CacheState>();
  private static emitter: EventEmitter = new EventEmitter();

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
    for (const cacheKey of RunCache.cache.keys()) {
      if (RunCache.matchesPattern(pattern, cacheKey)) {
        matchingKeys.push(cacheKey);
      }
    }
    return matchingKeys;
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

    RunCache.cache.set(key, {
      value: cacheValue ?? "undefined",
      ttl,
      sourceFn,
      autoRefetch,
      interval: interval || undefined,
      createdAt: time,
      updatedAt: time,
    });

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

      for (const [cacheKey, cached] of RunCache.cache.entries()) {
        if (RunCache.matchesPattern(key, cacheKey) && !RunCache.isExpired(cached)) {
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

    return RunCache.cache.get(key)?.value ?? undefined;
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
      // For wildcard patterns, we need to listen to all expire events and filter
      RunCache.emitter.on(EVENT.EXPIRE, (params: EventParam) => {
        if (RunCache.matchesPattern(key, params.key)) {
          callback(params);
        }
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
      // For wildcard patterns, we need to listen to all refetch events and filter
      RunCache.emitter.on(EVENT.REFETCH, (params: EventParam) => {
        if (RunCache.matchesPattern(key, params.key)) {
          callback(params);
        }
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
      // For wildcard patterns, we need to listen to all refetch failure events and filter
      RunCache.emitter.on(EVENT.REFETCH_FAILURE, (params: EventParam) => {
        if (RunCache.matchesPattern(key, params.key)) {
          callback(params);
        }
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
      return true;
    }

    if (params.key && !params.event) {
      throw Error("`key` cannot be provided without `event`");
    }

    if (params.event && params.key) {
      if (params.key.includes("*")) {
        const prefix = `${params.event}-`;
        const eventNames = RunCache.emitter.eventNames();
        
        for (const eventName of eventNames) {
          if (typeof eventName === "string" && eventName.startsWith(prefix)) {
            const eventKey = eventName.slice(prefix.length);
            if (RunCache.matchesPattern(params.key, eventKey)) {
              RunCache.emitter.removeAllListeners(eventName);
            }
          }
        }
      } else {
        RunCache.emitter.removeAllListeners(`${params.event}-${params.key}`);
      }
      return true;
    }

    if (params.event) {
      RunCache.emitter.removeAllListeners(params.event);

      RunCache.emitter.eventNames().forEach((eventName) => {
        if (
          params.event &&
          typeof eventName === "string" &&
          eventName.startsWith(params.event)
        ) {
          RunCache.emitter.removeAllListeners(eventName);
        }
      });

      return true;
    }

    return false;
  }
}

export { RunCache };
