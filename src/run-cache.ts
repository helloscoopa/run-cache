type SourceFn = () => Promise<string>;

type CacheState = {
  value: string;
  sourceFn?: SourceFn;
  createAt: number;
  updateAt: number;
  ttl?: number;
  autoRefetch?: boolean;
};

class RunCache {
  private static cache: Map<string, CacheState> = new Map<string, CacheState>();

  private static isExpired(cache: CacheState): boolean {
    if (!cache.ttl) return false;

    return cache.updateAt + cache.ttl < Date.now();
  }

  /**
   * Sets a value in the cache with an optional time-to-live (TTL) value.
   * This method stores the value associated with the given key and tracks the creation and update timestamps.
   *
   * @param {Object} params - Parameters for setting the cache entry.
   * @param {string} params.key - The key under which the value will be stored in the cache.
   * @param {string} params.value - The string value to be stored in the cache.
   * @param {number} [params.ttl] - Optional. Time-to-live for the cached entry in milliseconds. If not specified, the entry will not automatically expire.
   * @returns {boolean} Returns `true` if the value was successfully set in the cache.
   * @throws {Error} Throws an error if the `key` or `value` is empty.
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
    sourceFn?: SourceFn;
    autoRefetch?: boolean;
  }): Promise<boolean> {
    if (!key.length) {
      throw Error("Empty key");
    }

    if (sourceFn === undefined && !value.length) {
      throw Error("`Value` can't be empty without a `sourceFn`");
    }

    if (!ttl && autoRefetch) {
      throw Error("`autoRefetch` is not allowed without a `ttl`");
    }

    const time = Date.now();

    if (sourceFn) {
      try {
        const value = await sourceFn.call(this);

        RunCache.cache.set(key, {
          value: JSON.stringify(value),
          ttl: ttl,
          sourceFn,
          autoRefetch,
          createAt: time,
          updateAt: time,
        });

        return true;
      } catch (e) {
        throw Error("Source function failed");
      }
    }

    RunCache.cache.set(key, {
      value,
      ttl,
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

    if (!cached.sourceFn) {
      throw Error("No source function found");
    }

    try {
      const value = await cached.sourceFn.call(this);
      RunCache.cache.set(key, {
        value: JSON.stringify(value),
        ttl: cached.ttl,
        sourceFn: cached.sourceFn,
        createAt: cached.createAt,
        updateAt: Date.now(),
      });

      return true;
    } catch (e) {
      throw Error("Source function failed");
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

    if (!this.isExpired(cached)) {
      return cached.value;
    }

    if (cached.sourceFn === undefined || !cached.autoRefetch) {
      RunCache.cache.delete(key);
      return undefined;
    }

    await RunCache.refetch(key);

    return RunCache.cache.get(key).value;
  }

  /**
   * Deletes the cached value associated with the given key.
   *
   * @param {string} key - The cache key.
   * @returns {boolean} True if the key was deleted, false otherwise.
   */
  static delete(key: string): boolean {
    return RunCache.cache.delete(key);
  }

  /**
   * Clears all cached values.
   *
   * @returns {void}
   */
  static deleteAll(): void {
    RunCache.cache.clear();
  }

  /**
   * Checks if the cache contains a valid (non-expired) value for the given key.
   *
   * @param {string} key - The cache key.
   * @returns {boolean} True if the cache contains a valid value for the key, false otherwise.
   */
  static has(key: string): boolean {
    const cached = RunCache.cache.get(key);

    if (!cached) {
      return false;
    }

    return !this.isExpired(cached);
  }
}

export { RunCache };
