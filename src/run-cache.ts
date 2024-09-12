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
   * Adds a value to the cache with an optional TTL.
   *
   * @param {string} key - The cache key.
   * @param {string} value - The value to cache.
   * @param {number} [ttl] - Optional time-to-live in milliseconds.
   * @returns {boolean} - The state of the operation
   * @throws Will throw an error if the key or value is empty
   */
  static set({
    key,
    value,
    ttl,
  }: {
    key: string;
    value: string;
    ttl?: number;
  }): boolean {
    if (!key.length) {
      throw Error("Empty key");
    }

    if (!value.length) {
      throw Error("Empty value");
    }

    RunCache.cache.set(key, {
      value,
      ttl,
      createAt: Date.now(),
      updateAt: Date.now(),
    });

    return true;
  }

  /**
   * Sets a value in the cache using a provided source function.
   * The value is stored with an expiry time, and the caching behavior can be customized with optional parameters.
   *
   * @async
   * @param {Object} params - Parameters for setting the cache entry.
   * @param {string} params.key - The key under which the value will be stored in the cache.
   * @param {SourceFn} params.sourceFn - A function that generates the value to be cached. This function is called in the context of the current class instance.
   * @param {number} [params.ttl] - Optional. Time-to-live for the cached entry in milliseconds. If not specified, the default TTL will be used.
   * @param {boolean} [params.autoRefetch] - Optional. Determines whether the cache should automatically refetch the value after it expires.
   * @returns {Promise<void>} Resolves when the value has been successfully set in the cache.
   * @throws {Error} Throws an error if the source function fails to execute.
   */
  static async setWithSourceFn({
    key,
    sourceFn,
    ttl,
    autoRefetch,
  }: {
    key: string;
    sourceFn: SourceFn;
    ttl?: number;
    autoRefetch?: boolean;
  }): Promise<void> {
    try {
      const value = await sourceFn.call(this);

      RunCache.cache.set(key, {
        value: JSON.stringify(value),
        ttl: ttl,
        sourceFn,
        autoRefetch,
        createAt: Date.now(),
        updateAt: Date.now(),
      });
    } catch (e) {
      throw Error("Source function failed");
    }
  }

  /**
   * Refetches the cached value using the stored source function and updates the cache with the new value.
   *
   * @param {string} key - The cache key.
   * @param {number} [ttl] - Optional time-to-live in milliseconds for the updated value.
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
   * Retrieves the cached value associated with the given key if it exists and has not expired.
   *
   * @param {string} key - The cache key.
   * @returns {string | undefined} The cached value, or undefined if not found or expired.
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

    if (!cached.sourceFn) {
      RunCache.cache.delete(key);
      return undefined;
    }

    if (!cached.autoRefetch) {
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
