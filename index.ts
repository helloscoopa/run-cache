type SourceFn = () => Promise<string>;

type CacheState = {
  value: string;
  sourceFn?: SourceFn;
  expiry?: number;
};

export class RunCache {
  private static cache: Map<string, CacheState> = new Map<string, CacheState>();

  private static getExpiry(ttl: number | undefined): number | undefined {
    return ttl ? Date.now() + ttl : undefined;
  }

  /**
   * Adds a value to the cache with an optional TTL.
   *
   * @param {string} key - The cache key.
   * @param {string} value - The value to cache.
   * @param {number} [ttl] - Optional time-to-live in milliseconds.
   * @returns {void}
   */
  static set(key: string, value: string, ttl?: number): void {
    RunCache.cache.set(key, { value, expiry: this.getExpiry(ttl) });
  }

  /**
   * Adds a value to the cache using a source function and sets an optional TTL.
   * The source function is used to generate the value and is stored for future refetching.
   *
   * @param {string} key - The cache key.
   * @param {SourceFn} sourceFn - The function used to generate the value to be cached.
   * @param {number} [ttl] - Optional time-to-live in milliseconds.
   * @returns {Promise<void>} A promise that resolves when the value is set.
   * @throws Will throw an error if the source function fails.
   */
  static async setWithSourceFn(
    key: string,
    sourceFn: SourceFn,
    ttl?: number,
  ): Promise<void> {
    try {
      const value = await sourceFn.call(this);
      RunCache.cache.set(key, {
        value: JSON.stringify(value),
        expiry: this.getExpiry(ttl),
        sourceFn: sourceFn,
      });
    } catch (e) {
      throw e;
    }
  }

  /**
   * Refetches the cached value using the stored source function and updates the cache with the new value.
   *
   * @param {string} key - The cache key.
   * @param {number} [ttl] - Optional time-to-live in milliseconds for the updated value.
   * @returns {Promise<void>} A promise that resolves when the value is updated.
   * @throws Will throw an error if the source function fails.
   */
  static async refetch(key: string, ttl?: number): Promise<void> {
    const cached = RunCache.cache.get(key);

    if (!cached) {
      return;
    }

    if (!cached.sourceFn) {
      return;
    }

    try {
      const value = await cached.sourceFn.call(this);
      RunCache.cache.set(key, {
        value: JSON.stringify(value),
        expiry: this.getExpiry(ttl),
        sourceFn: cached.sourceFn,
      });
    } catch (e) {
      throw e;
    }
  }

  /**
   * Retrieves the cached value associated with the given key if it exists and has not expired.
   *
   * @param {string} key - The cache key.
   * @returns {string | undefined} The cached value, or undefined if not found or expired.
   */
  static get(key: string): string | undefined {
    const cached = RunCache.cache.get(key);

    if (!cached) {
      return undefined;
    }

    if (cached.expiry && cached.expiry < Date.now()) {
      RunCache.cache.delete(key);
      return undefined;
    }

    return cached.value;
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

    if (cached.expiry && cached.expiry < Date.now()) {
      RunCache.cache.delete(key);
      return false;
    }

    return true;
  }
}
