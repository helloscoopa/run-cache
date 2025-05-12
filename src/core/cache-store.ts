import { RunCacheConfig, EvictionPolicy } from '../types/cache-config';
import { CacheState, SourceFn } from '../types/cache-state';
import { EVENT, EmitParam, EventName } from '../types/events';
import { Logger } from '../logging/logger';
import { EventSystem } from './event-system';
import { LFUPolicy, LRUPolicy } from '../policies/eviction-policies';
import { CacheUtils } from './utils';

/**
 * The core cache storage implementation handling cache operations
 */
export class CacheStore {
  private cache: Map<string, CacheState>;
  private config: RunCacheConfig;
  private logger: Logger;
  private eventSystem: EventSystem;
  private lruPolicy: LRUPolicy;
  private lfuPolicy: LFUPolicy;

  constructor(config: RunCacheConfig = {}) {
    this.config = {
      maxSize: Number.POSITIVE_INFINITY,
      evictionPolicy: EvictionPolicy.NONE,
      verbose: false,
      ...config
    };
    
    this.cache = new Map<string, CacheState>();
    this.logger = new Logger(this.config);
    this.eventSystem = new EventSystem(this.logger);
    
    // Initialize policies
    this.lruPolicy = new LRUPolicy(this.logger);
    this.lfuPolicy = new LFUPolicy(this.logger);
  }

  /**
   * Sets a cache entry with the specified key, value, and optional parameters
   */
  async set({
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
      this.logger.log('error', `Empty key provided to set() method`);
      throw new Error("Empty key");
    }

    if (sourceFn === undefined && (value === undefined || !value.length)) {
      this.logger.log('error', `Neither value nor sourceFn provided to set() method for key: ${key}`);
      throw new Error("`value` can't be empty without a `sourceFn`");
    }

    if (autoRefetch && !ttl) {
      this.logger.log('error', `autoRefetch enabled without ttl for key: ${key}`);
      throw new Error("`autoRefetch` is not allowed without a `ttl`");
    }

    const time = Date.now();
    
    this.logger.log('info', `Setting cache for key: ${key}`, { 
      hasTtl: ttl !== undefined,
      ttl,
      hasValue: value !== undefined,
      hasSourceFn: sourceFn !== undefined,
      autoRefetch 
    });

    // Clear existing interval if the key already exists
    const existingCache = this.cache.get(key);
    if (existingCache?.interval) {
      this.logger.log('debug', `Clearing existing interval for key: ${key}`);
      clearInterval(existingCache.interval);
    }

    let interval: ReturnType<typeof setInterval> | null = null;

    if (ttl !== undefined) {
      if (ttl < 0) {
        this.logger.log('error', `Negative ttl provided for key: ${key}`, { ttl });
        throw new Error("Value `ttl` cannot be negative");
      }

      this.logger.log('debug', `Setting expiry interval for key: ${key}, ttl: ${ttl}ms`);
      interval = setInterval(() => {
        this.logger.log('debug', `TTL expired for key: ${key}`);
        this.eventSystem.emitEvent(EVENT.EXPIRE, {
          key,
          value: value ?? "undefined",
          ttl,
          createdAt: time,
          updatedAt: time,
        });

        if (typeof sourceFn === "function" && autoRefetch) {
          this.logger.log('debug', `Auto-refetching key: ${key}`);
          this.refetchSingle(key).catch((e) => {
            this.logger.log('error', `Auto-refetch failed for key: ${key}`, e);
            /* Ignore as the event is already emitted inside the function */
          });
        }
      }, ttl);
    }

    let cacheValue = value;

    if (value === undefined && typeof sourceFn === "function") {
      try {
        this.logger.log('debug', `Fetching value using sourceFn for key: ${key}`);
        cacheValue = await sourceFn();
        this.logger.log('debug', `Successfully fetched value using sourceFn for key: ${key}`);
      } catch (e) {
        this.logger.log('error', `Source function failed for key: ${key}`, e);
        throw new Error(`Source function failed for key: '${key}'`);
      }
    }

    // Check if adding this entry will exceed max size and enforce eviction if needed
    // Do this check BEFORE adding the new entry to ensure proper eviction
    if (this.cache.size >= (this.config.maxSize ?? Number.POSITIVE_INFINITY) &&
        !this.cache.has(key) &&
        this.config.evictionPolicy !== EvictionPolicy.NONE) {
      // We're adding a new key and we're already at max size, so evict one
      this.logger.log('info', `Cache at capacity, evicting one entry before adding key: ${key}`);
      this.enforceEvictionPolicy(1);
    }

    // Set up proper access metadata - preserve existing metadata for updates
    const accessCount = existingCache ? existingCache.accessCount : 0;
    const lastAccessed = existingCache ? existingCache.lastAccessed : time;

    this.cache.set(key, {
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
    
    this.logger.log('debug', `Cache entry set successfully for key: ${key}`, { 
      newSize: this.cache.size,
      maxSize: this.config.maxSize
    });

    // Double-check after adding to ensure we're not over the limit
    this.enforceEvictionPolicy();
    return true;
  }

  /**
   * Updates the access metadata for a specific cache entry
   * @param key The cache key to update
   */
  private updateAccessMetadata(key: string): void {
    const cached = this.cache.get(key);
    if (cached) {
      // Use the current timestamp for the update
      const now = Date.now();
      const previousAccess = { lastAccessed: cached.lastAccessed, accessCount: cached.accessCount };
      cached.lastAccessed = now;
      cached.accessCount += 1;
      this.cache.set(key, cached);
      
      this.logger.log('debug', `Updated access metadata for key: ${key}`, { 
        before: previousAccess,
        after: { lastAccessed: cached.lastAccessed, accessCount: cached.accessCount }
      });
    }
    this.enforceEvictionPolicy();
  }

  /**
   * Enforces the configured eviction policy if needed
   */
  private enforceEvictionPolicy(forcedCount?: number): void {
    // Skip if the cache isn't full yet
    if (this.cache.size <= (this.config.maxSize ?? Number.POSITIVE_INFINITY)) {
      return;
    }

    // Number of entries to evict
    const entriesToEvict = forcedCount || this.cache.size - (this.config.maxSize ?? Number.POSITIVE_INFINITY);
    
    if (entriesToEvict <= 0) {
      return;
    }

    this.logger.log('info', `Cache size (${this.cache.size}) exceeds max size (${this.config.maxSize}), evicting ${entriesToEvict} entries using ${this.config.evictionPolicy} policy`);

    // Choose eviction strategy based on configuration
    let keysToEvict: string[] = [];
    
    switch (this.config.evictionPolicy) {
      case EvictionPolicy.LRU:
        keysToEvict = this.lruPolicy.getEntriesToEvict(
          Array.from(this.cache.entries()),
          entriesToEvict
        );
        break;
      case EvictionPolicy.LFU:
        keysToEvict = this.lfuPolicy.getEntriesToEvict(
          Array.from(this.cache.entries()),
          entriesToEvict
        );
        break;
      case EvictionPolicy.NONE:
      default:
        // No automatic eviction
        this.logger.log('debug', `Skipping eviction as policy is set to NONE`);
        break;
    }
    
    // Evict the selected keys
    for (const key of keysToEvict) {
      this.deleteSingle(key);
    }
  }

  /**
   * Gets matching keys from the cache
   */
  private getMatchingKeys(pattern: string): string[] {
    if (!pattern.includes("*")) {
      return this.cache.has(pattern) ? [pattern] : [];
    }

    const matchingKeys: string[] = [];
    // Take a snapshot of all keys to avoid concurrent modification issues
    const allKeys = Array.from(this.cache.keys());
    
    for (const cacheKey of allKeys) {
      if (CacheUtils.matchesPattern(pattern, cacheKey)) {
        matchingKeys.push(cacheKey);
      }
    }
    return matchingKeys;
  }

  /**
   * Retrieves a value from the cache by key
   */
  async get(key: string): Promise<string | string[] | undefined> {
    if (!key) {
      this.logger.log('debug', `Get called with empty key`);
      return undefined;
    }

    const isWildcard = key.includes("*");
    this.logger.log('debug', `Get called for ${isWildcard ? 'wildcard' : 'exact'} key: ${key}`);

    // If wildcard is present, fetch all matching keys
    if (isWildcard) {
      const matchingValues: string[] = [];

      // Take a snapshot first to avoid concurrent modification issues
      // This prevents problems if enforceEvictionPolicy() is called during iteration
      const snapshot = Array.from(this.cache.entries());
      this.logger.log('debug', `Processing ${snapshot.length} entries for wildcard key: ${key}`);
      
      for (const [cacheKey, cached] of snapshot) {
        if (CacheUtils.matchesPattern(key, cacheKey) && !CacheUtils.isExpired(cached)) {
          this.logger.log('debug', `Matched key: ${cacheKey} for pattern: ${key}`);
          // Update access metadata for the matched key
          this.updateAccessMetadata(cacheKey);
          matchingValues.push(cached.value);
        }
      }

      this.logger.log('info', `Get with wildcard ${key} returned ${matchingValues.length} results`);
      return matchingValues.length > 0 ? matchingValues : undefined;
    }

    // Handle exact key match
    const cached = this.cache.get(key);

    if (!cached) {
      this.logger.log('debug', `Key not found: ${key}`);
      return undefined;
    }

    if (!CacheUtils.isExpired(cached)) {
      this.logger.log('debug', `Cache hit for key: ${key}`);
      // Update access metadata for LRU/LFU
      this.updateAccessMetadata(key);
      return cached.value;
    }

    this.logger.log('info', `Cache expired for key: ${key}`);
    this.eventSystem.emitEvent(EVENT.EXPIRE, {
      key: key,
      value: cached.value,
      ttl: cached.ttl,
      createdAt: cached.createdAt,
      updatedAt: cached.updatedAt,
    });

    if (typeof cached.sourceFn === "undefined" || !cached.autoRefetch) {
      this.logger.log('debug', `Deleting expired key without auto-refetch: ${key}`);
      this.cache.delete(key);
      return undefined;
    }

    this.logger.log('debug', `Auto-refetching expired key: ${key}`);
    await this.refetchSingle(key);
    
    // Update access metadata after refetch
    const refetched = this.cache.get(key);
    if (refetched) {
      this.logger.log('debug', `Auto-refetch successful for key: ${key}`);
      this.updateAccessMetadata(key);
      return refetched.value;
    }
    
    this.logger.log('debug', `Auto-refetch failed for key: ${key}`);
    return undefined;
  }

  /**
   * Refetch the cached value using the stored source function
   */
  async refetch(key: string): Promise<boolean> {
    // Handle wildcard patterns
    if (key.includes("*")) {
      this.logger.log('info', `Refetching multiple keys matching pattern: ${key}`);
      const matchingKeys = this.getMatchingKeys(key);
      if (matchingKeys.length === 0) {
        this.logger.log('debug', `No keys found matching pattern: ${key}`);
        return false;
      }

      this.logger.log('debug', `Found ${matchingKeys.length} keys matching pattern: ${key}`, { matchingKeys });

      // Attempt to refetch all matching keys
      const results = await Promise.all(
        matchingKeys.map(async (matchedKey) => {
          try {
            return await this.refetchSingle(matchedKey);
          } catch (e) {
            this.logger.log('error', `Failed to refetch key: ${matchedKey}`, e);
            // If one key fails, we still want to try the others
            return false;
          }
        })
      );

      // Return true if any refetch was successful
      const anySuccessful = results.some(result => result === true);
      this.logger.log('info', `Refetch of pattern ${key} ${anySuccessful ? 'succeeded' : 'failed'}`);
      return anySuccessful;
    }

    // Handle single key
    return this.refetchSingle(key);
  }

  /**
   * Helper method to refetch a single key
   */
  private async refetchSingle(key: string): Promise<boolean> {
    this.logger.log('debug', `Attempting to refetch single key: ${key}`);
    const cached = this.cache.get(key);

    if (!cached) {
      this.logger.log('debug', `Refetch failed: key not found: ${key}`);
      return false;
    }

    if (typeof cached.sourceFn === "undefined") {
      this.logger.log('debug', `Refetch failed: no sourceFn for key: ${key}`);
      return false;
    }

    if (cached.fetching) {
      this.logger.log('debug', `Refetch skipped: already fetching key: ${key}`);
      return false;
    }

    try {
      this.logger.log('debug', `Setting fetching flag for key: ${key}`);
      this.cache.set(key, { ...cached, fetching: true });

      this.logger.log('debug', `Calling sourceFn for key: ${key}`);
      const value = await cached.sourceFn();
      this.logger.log('debug', `SourceFn succeeded for key: ${key}`);

      const refetchedCache = {
        value: value,
        ttl: cached.ttl,
        sourceFn: cached.sourceFn,
        createdAt: cached.createdAt,
        updatedAt: Date.now(),
        accessCount: cached.accessCount + 1,
        lastAccessed: Date.now(),
        autoRefetch: cached.autoRefetch,
        interval: cached.interval,
      };

      this.cache.set(key, {
        ...refetchedCache,
        fetching: undefined,
      });
      
      this.logger.log('info', `Successfully refetched key: ${key}`);

      this.eventSystem.emitEvent(EVENT.REFETCH, {
        key,
        value: refetchedCache.value,
        ttl: refetchedCache.ttl,
        createdAt: refetchedCache.createdAt,
        updatedAt: refetchedCache.updatedAt,
      });

      return true;
    } catch (e) {
      this.logger.log('error', `Refetch failed for key: ${key}`, e);
      this.cache.set(key, {
        ...cached,
        fetching: undefined,
      });

      this.eventSystem.emitEvent(EVENT.REFETCH_FAILURE, {
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
   * Deletes cache entries matching the specified key
   */
  delete(key: string): boolean {
    if (key.includes("*")) {
      this.logger.log('info', `Deleting keys matching pattern: ${key}`);
      const matchingKeys = this.getMatchingKeys(key);
      if (matchingKeys.length === 0) {
        this.logger.log('debug', `No keys found matching pattern: ${key}`);
        return false;
      }

      this.logger.log('debug', `Found ${matchingKeys.length} keys matching pattern: ${key}`, { matchingKeys });

      let anyDeleted = false;
      for (const matchedKey of matchingKeys) {
        const deleted = this.deleteSingle(matchedKey);
        anyDeleted = anyDeleted || deleted;
      }
      return anyDeleted;
    }

    return this.deleteSingle(key);
  }

  /**
   * Helper method to delete a single key
   */
  private deleteSingle(key: string): boolean {
    const cache = this.cache.get(key);
    if (!cache) {
      this.logger.log('debug', `Delete failed: key not found: ${key}`);
      return false;
    }

    if (cache.interval) {
      this.logger.log('debug', `Clearing interval for key: ${key}`);
      clearInterval(cache.interval);
    }

    this.logger.log('info', `Deleted key: ${key}`);
    return this.cache.delete(key);
  }

  /**
   * Deletes all cache entries and clears intervals
   */
  flush(): void {
    const values = Array.from(this.cache.values());
    const count = values.length;

    this.logger.log('info', `Flushing ${count} cache entries`);

    values.forEach(({ interval }) => {
      if (interval) {
        clearInterval(interval);
      }
    });

    this.cache.clear();
    this.logger.log('debug', `Cache flushed successfully, removed ${count} entries`);
  }

  /**
   * Checks if cache entries exist for the given key
   */
  async has(key: string): Promise<boolean> {
    if (key.includes("*")) {
      this.logger.log('debug', `Checking existence for pattern: ${key}`);
      const matchingKeys = this.getMatchingKeys(key);
      
      for (const matchedKey of matchingKeys) {
        const exists = await this.hasSingle(matchedKey);
        if (exists) {
          this.logger.log('debug', `Found existing key: ${matchedKey} for pattern: ${key}`);
          return true;
        }
      }
      
      this.logger.log('debug', `No valid keys found for pattern: ${key}`);
      return false;
    }

    return this.hasSingle(key);
  }

  /**
   * Helper method to check existence of a single key
   */
  private async hasSingle(key: string): Promise<boolean> {
    const cached = this.cache.get(key);

    if (!cached) {
      return false;
    }

    if (CacheUtils.isExpired(cached)) {
      this.eventSystem.emitEvent(EVENT.EXPIRE, {
        key: key,
        value: cached.value,
        ttl: cached.ttl,
        createdAt: cached.createdAt,
        updatedAt: cached.updatedAt,
      });

      return false;
    }
    
    // Update access metadata for LRU/LFU
    this.updateAccessMetadata(key);
    return true;
  }

  /**
   * Configures cache settings
   */
  configure(config: RunCacheConfig): void {
    const previousConfig = { ...this.config };
    this.config = { ...this.config, ...config };
    
    // Update logger with new configuration
    this.logger.updateConfig(this.config);
    
    const verboseChanged = previousConfig.verbose !== this.config.verbose;
    // If verbose is being enabled, log that fact
    if (verboseChanged && this.config.verbose) {
      this.logger.log('info', `Verbose logging enabled`);
    }
    
    this.logger.log('info', `Configuration updated`, { 
      previous: previousConfig,
      current: this.config
    });
  }

  /**
   * Gets the current configuration
   */
  getConfig(): RunCacheConfig {
    return { ...this.config };
  }

  /**
   * Event system accessor methods
   */
  onExpiry(callback: (event: EmitParam & { key: string }) => void | Promise<void>): void {
    this.eventSystem.onExpiry(callback);
  }

  onKeyExpiry(key: string, callback: (event: EmitParam & { key: string }) => void | Promise<void>): void {
    this.eventSystem.onKeyExpiry(key, callback);
  }

  onRefetch(callback: (event: EmitParam & { key: string }) => void | Promise<void>): void {
    this.eventSystem.onRefetch(callback);
  }

  onKeyRefetch(key: string, callback: (event: EmitParam & { key: string }) => void | Promise<void>): void {
    this.eventSystem.onKeyRefetch(key, callback);
  }

  onRefetchFailure(callback: (event: EmitParam & { key: string }) => void | Promise<void>): void {
    this.eventSystem.onRefetchFailure(callback);
  }

  onKeyRefetchFailure(key: string, callback: (event: EmitParam & { key: string }) => void | Promise<void>): void {
    this.eventSystem.onKeyRefetchFailure(key, callback);
  }

  clearEventListeners(params?: { event?: EventName; key?: string }): boolean {
    return this.eventSystem.clearEventListeners(params);
  }

  /**
   * Performs a complete shutdown of the cache
   */
  shutdown(): void {
    this.logger.log('info', `Shutting down cache`);
    
    // Clear all cache entries and their intervals
    this.flush();
    
    // Remove all event listeners
    this.clearEventListeners();
    
    // Reset configuration to defaults but preserve verbose setting for final log
    const wasVerbose = this.config.verbose;
    this.config = {
      maxSize: Number.POSITIVE_INFINITY,
      evictionPolicy: EvictionPolicy.NONE,
      verbose: wasVerbose,
    };
    
    // Log shutdown completion 
    this.logger.log('info', 'Cache shutdown complete, all resources released');
  }
} 