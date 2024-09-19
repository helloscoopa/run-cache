import { EventEmitter } from "node:events";

type CacheState = {
  value: string;
  createAt: number;
  updateAt: number;
  ttl?: number;
  autoRefetch?: boolean;
  fetching?: boolean;
  sourceFn?: SourceFn;
  timeout?: NodeJS.Timeout;
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
   * Sets a value in the cache with optional time-to-live (TTL) and auto-refetch options.
   *
   * @param {Object} params - The parameters for setting the cache entry.
   * @param {string} params.key - The unique key to identify the cache entry. Must not be empty.
   * @param {string} [params.value] - The value to store in the cache. Required if `sourceFn` is not provided.
   * @param {number} [params.ttl] - The time-to-live (TTL) in milliseconds for the cache entry. The entry expires after this period.
   * @param {boolean} [params.autoRefetch] - If true, automatically refetches the value from `sourceFn` when TTL expires.
   * @param {SourceFn} [params.sourceFn] - A function to fetch the value when `value` is not provided or for refetching when TTL expires.
   *
   * @throws {Error} If the `key` is empty.
   * @throws {Error} If neither `value` nor `sourceFn` is provided.
   * @throws {Error} If `autoRefetch` is enabled without setting a `ttl`.
   * @throws {Error} If `ttl` is negative.
   * @throws {Error} If `onExpire` is provided without a `ttl`.
   * @throws {Error} If the `sourceFn` throws an error while fetching the value.
   *
   * @returns {Promise<boolean>} - Returns `true` when the value is successfully set in the cache.
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

    if (!sourceFn && !value) {
      throw new Error("`value` can't be empty without a `sourceFn`");
    }

    if (autoRefetch && !ttl) {
      throw new Error("`autoRefetch` is not allowed without a `ttl`");
    }

    const time = Date.now();
    let timeout: NodeJS.Timeout | null = null;

    if (ttl !== undefined) {
      if (ttl < 0) throw new Error("Value `ttl` cannot be negative");

      timeout = setTimeout(async () => {
        if (typeof sourceFn === "function" && autoRefetch) {
          await RunCache.refetch(key);
        }

        RunCache.emitEvent("expire", {
          key,
          value: value!,
          ttl,
          createAt: time,
          updateAt: time,
        });
      }, ttl);
    }

    let cachedValue = value;

    if (!value && typeof sourceFn === "function") {
      try {
        cachedValue = await sourceFn();
      } catch (e) {
        throw new Error(`Source function failed for key: '${key}'`);
      }
    }

    RunCache.cache.set(key, {
      value: JSON.stringify(cachedValue),
      ttl,
      sourceFn,
      autoRefetch,
      timeout: ttl ? timeout! : undefined,
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
   * @throws Will throw an error if the source function fails.
   */
  static async refetch(key: string): Promise<boolean> {
    const cached = RunCache.cache.get(key);

    if (!cached) {
      return false;
    }

    if (typeof cached.sourceFn === "undefined") {
      throw Error(`No source function found for key: '${key}'`);
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

      RunCache.cache.set(key, {
        fetching: undefined,
        ...refetchedCache,
      });

      console.log("refetch emitted", Date.now());
      RunCache.emitEvent("refetch", {
        key,
        value: refetchedCache.value,
        ttl: refetchedCache.ttl,
        createAt: refetchedCache.createAt,
        updateAt: refetchedCache.updateAt,
      });

      return true;
    } catch (e) {
      RunCache.cache.set(key, {
        fetching: undefined,
        ...cached,
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

    RunCache.emitEvent("expire", {
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
   * Deletes the cached value associated with the given key.
   *
   * @param {string} key - The cache key.
   * @returns {boolean} True if the key was deleted, false otherwise.
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
   * Clears all cached values.
   *
   * @returns {void}
   */
  static deleteAll(): void {
    const values = Array.from(RunCache.cache.values());

    values.forEach(({ timeout }) => {
      if (timeout) {
        clearTimeout(timeout);
      }
    });

    RunCache.cache.clear();
  }

  /**
   * Checks if the cache contains a valid (non-expired) value for the given key.
   *
   * @param {string} key - The cache key.
   * @returns {boolean} True if the cache contains a valid value for the key, false otherwise.
   */
  static async has(key: string): Promise<boolean> {
    const cached = RunCache.cache.get(key);

    if (!cached) {
      return false;
    }

    if (RunCache.isExpired(cached)) {
      RunCache.emitEvent("expire", {
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

  private static emitEvent(event: "expire" | "refetch", cache: EmitParam) {
    [event, `${event}-${cache.key}`].forEach((eventName) => {
      RunCache.emitter.emit(eventName, {
        key: cache.key,
        value: cache.value,
        ttl: cache.ttl,
        createAt: cache.createAt,
        updateAt: cache.updateAt,
      });
    });
  }

  static onExpiry(callback: EventFn) {
    RunCache.emitter.on(`expire`, callback);
  }

  static onKeyExpiry(key: string, callback: EventFn) {
    if (!key) throw Error("Empty key");

    RunCache.emitter.on(`expire-${key}`, callback);
  }

  static onRefetch(callback: EventFn) {
    RunCache.emitter.on(`refetch`, callback);
  }

  static onKeyRefetch(key: string, callback: EventFn) {
    if (!key) throw Error("Empty key");

    RunCache.emitter.on(`refetch-${key}`, callback);
  }

  static clearEventListeners(
    event: "expire" | "refetch" | undefined = undefined,
    key: string | undefined = undefined,
  ) {
    RunCache.emitter.removeAllListeners();
  }
}

export { RunCache };
