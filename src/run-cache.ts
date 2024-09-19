import { EventEmitter } from "node:events";

type CacheState = {
  value: string;
  createAt: number;
  updateAt: number;
  ttl?: number;
  autoRefetch?: boolean;
  fetching?: boolean;
  sourceFn?: SourceFn;
  timeout?: ReturnType<typeof setTimeout>;
};

export type EventParam = {
  key: string;
  value: string;
  ttl?: number;
  createAt: number;
  updateAt: number;
};

type EmitParam = Pick<CacheState, "value" | "ttl" | "createAt" | "updateAt"> & {
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

    return cache.updateAt + cache.ttl < Date.now();
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

    // Clear existing timeout if the key already exists
    const existingCache = RunCache.cache.get(key);
    if (existingCache && existingCache.timeout) {
      clearTimeout(existingCache.timeout);
    }

    let timeout: ReturnType<typeof setTimeout> | null = null;

    if (ttl !== undefined) {
      if (ttl < 0) throw new Error("Value `ttl` cannot be negative");

      timeout = setTimeout(() => {
        RunCache.emitEvent(EVENT.EXPIRE, {
          key,
          value: JSON.stringify(value ?? ""),
          ttl,
          createAt: time,
          updateAt: time,
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
      value: JSON.stringify(cacheValue),
      ttl,
      sourceFn,
      autoRefetch,
      timeout: timeout ?? undefined,
      createAt: time,
      updateAt: time,
    });

    return true;
  }

  /**
   * Refetch the cached value using the stored source function and updates the cache with the new value.
   *
   * @param {string} key - The cache key.
   * @returns {Promise<boolean>} A promise that resolves to a boolean representing the execution state of the request.
   */
  static async refetch(key: string): Promise<boolean> {
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
        value: JSON.stringify(value),
        ttl: cached.ttl,
        sourceFn: cached.sourceFn,
        createAt: cached.createAt,
        updateAt: Date.now(),
      };

      RunCache.emitEvent(EVENT.REFETCH, {
        key,
        value: refetchedCache.value,
        ttl: refetchedCache.ttl,
        createAt: refetchedCache.createAt,
        updateAt: refetchedCache.updateAt,
      });

      RunCache.cache.set(key, {
        fetching: undefined,
        ...refetchedCache,
      });

      return true;
    } catch (e) {
      RunCache.cache.set(key, {
        fetching: undefined,
        ...cached,
      });

      RunCache.emitEvent(EVENT.REFETCH_FAILURE, {
        key,
        value: cached.value,
        ttl: cached.ttl,
        createAt: cached.createAt,
        updateAt: cached.updateAt,
      });

      throw Error(`Source function failed for key: '${key}'`);
    }
  }

  /**
   * Retrieves a value from the cache by key. If the cached value has expired, it will be removed from the cache unless
   * `autoRefetch` is enabled with an associated `sourceFn`, in which case the value will be refetched automatically.
   *
   * @async
   * @param {string} key - The key of the cache entry to retrieve.
   * @returns {Promise<string | undefined>} A promise that resolves to the cached value if found and not expired, or `undefined` if the key is not found or the value has expired.
   */
  static async get(key: string): Promise<string | undefined> {
    if (!key) {
      return undefined;
    }

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
      createAt: cached.createAt,
      updateAt: cached.updateAt,
    });

    if (typeof cached.sourceFn === "undefined" || !cached.autoRefetch) {
      RunCache.cache.delete(key);
      return undefined;
    }

    await RunCache.refetch(key);

    return RunCache.cache.get(key)?.value ?? undefined;
  }

  /**
   * Deletes a cache entry by its key. If the entry has an active timeout (for TTL), it clears the timeout.
   *
   * @param {string} key - The key of the cache entry to delete. Must be a non-empty string.
   *
   * @returns {boolean} - Returns `true` if the cache entry was successfully deleted, `false` if no entry exists for the given key.
   */
  static delete(key: string): boolean {
    const cache = RunCache.cache.get(key);
    if (!cache) return false;

    if (cache.timeout) {
      clearTimeout(cache.timeout);
    }

    return RunCache.cache.delete(key);
  }

  /**
   * Deletes all cache entries and clears any active timeouts for TTL.
   * This method iterates over all cache entries, clears any associated timeouts, and then clears the entire cache.
   *
   * @returns {void}
   */
  static flush(): void {
    const values = Array.from(RunCache.cache.values());

    values.forEach(({ timeout }) => {
      if (timeout) {
        clearTimeout(timeout);
      }
    });

    RunCache.cache.clear();
  }

  /**
   * Checks if a cache entry exists for the given key and whether it has expired.
   *
   * @param {string} key - The key of the cache entry to check.
   * @returns {Promise<boolean>} - A promise that resolves to `true` if the cache entry exists and is not expired, otherwise `false`.
   *
   * This method retrieves the cache entry by key and checks if it is still valid.
   * If the cache entry has expired, an "expire" event is emitted and the method returns `false`.
   */
  static async has(key: string): Promise<boolean> {
    const cached = RunCache.cache.get(key);

    if (!cached) {
      return false;
    }

    if (RunCache.isExpired(cached)) {
      RunCache.emitEvent(EVENT.EXPIRE, {
        key: key,
        value: cached.value,
        ttl: cached.ttl,
        createAt: cached.createAt,
        updateAt: cached.updateAt,
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
        createAt: cache.createAt,
        updateAt: cache.updateAt,
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
    RunCache.emitter.on(`expire`, callback);
  }

  /**
   * Registers a callback function to be executed when the `expire` event for a specific key is triggered.
   *
   * @param {string} key - The key for which the expiration event is being tracked.
   * @param {EventFn} callback - The function to be executed when the event is triggered.
   *
   * @returns {void}
   *
   * @throws {Error} If the `key` is empty.
   */
  static onKeyExpiry(key: string, callback: EventFn): void {
    if (!key) throw Error("Empty key");

    RunCache.emitter.on(`${EVENT.EXPIRE}-${key}`, callback);
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
   *
   * @param {string} key - The key for which the refetch event is being tracked.
   * @param {EventFn} callback - The function to be executed when the event is triggered.
   *
   * @returns {void}
   *
   * @throws {Error} If the `key` is empty.
   */
  static onKeyRefetch(key: string, callback: EventFn): void {
    if (!key) throw Error("Empty key");

    RunCache.emitter.on(`${EVENT.REFETCH}-${key}`, callback);
  }

  static onRefetchFailure(callback: EventFn): void {
    RunCache.emitter.on(`${EVENT.REFETCH_FAILURE}`, callback);
  }

  static onKeyRefetchFailure(key: string, callback: EventFn): void {
    if (!key) throw Error("Empty key");

    RunCache.emitter.on(`${EVENT.REFETCH_FAILURE}-${key}`, callback);
  }

  /**
   * Clears event listeners from the RunCache emitter based on the specified event and key.
   *
   * - If no parameters are provided, all event listeners will be removed.
   * - If only an `event` is provided, all listeners for that event will be removed.
   * - If both `event` and `key` are provided, listeners for that specific event-key combination will be removed.
   *
   * @param {Object} [params] - Optional parameters to specify which listeners to clear.
   * @param {EventName} [params.event] - The event type for which listeners should be removed.
   * @param {string} [params.key] - The key associated with the event for which listeners should be removed. Must be provided if `event` is provided.
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
      RunCache.emitter.removeAllListeners(`${params.event}-${params.key}`);
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
