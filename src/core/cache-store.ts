import { RunCacheConfig, EvictionPolicy } from '../types/cache-config';
import { CacheState, SourceFn } from '../types/cache-state';
import { EVENT, EmitParam, EventName } from '../types/events';
import { Logger } from '../logging/logger';
import { EventSystem } from './event-system';
import { LFUPolicy, LRUPolicy } from '../policies/eviction-policies';
import { isExpired, matchesPattern, validateTTL } from './utils';
import { DefaultMiddlewareManager } from './middleware-manager';
import { MiddlewareContext, MiddlewareFunction, MiddlewareManager } from '../types/middleware';

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
  private middlewareManager: MiddlewareManager;

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
    this.middlewareManager = new DefaultMiddlewareManager(this.logger);
    
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

    // Validate that TTL is positive if provided
    try {
      validateTTL(ttl, key);
    } catch (error) {
      this.logger.log('error', `Invalid ttl provided for key: ${key}`, { ttl });
      throw error;
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
      clearTimeout(existingCache.interval);
    }

    let interval: ReturnType<typeof setTimeout> | null = null;

    if (ttl !== undefined) {
      this.logger.log('debug', `Setting expiry interval for key: ${key}, ttl: ${ttl}ms`);
      interval = setTimeout(() => {
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

    // Apply middleware to the value before storing it
    try {
      const context: MiddlewareContext = {
        key,
        operation: 'set',
        value: cacheValue,
        ttl,
        autoRefetch,
        timestamp: time
      };
      
      const processed = await this.middlewareManager.execute(cacheValue, context);
      if (processed === undefined) {
        this.logger.log('error', `Middleware returned undefined for key: ${key}`);
        throw new Error(`Middleware returned undefined for key: '${key}'`);
      }
      cacheValue = processed;
      this.logger.log('debug', `Applied middleware for key: ${key}`);
    } catch (error) {
      this.logger.log('error', `Middleware execution failed for key: ${key}`, error);
      throw new Error(`Middleware execution failed for key: '${key}'`);
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
    // Skip if the cache isn't full yet and there's no forced count
    if (!forcedCount && 
        this.cache.size <= (this.config.maxSize ?? Number.POSITIVE_INFINITY)) {
      return;
    }

    // Number of entries to evict
    const entriesToEvict = 
      forcedCount ?? 
      Math.max(0, this.cache.size - (this.config.maxSize ?? Number.POSITIVE_INFINITY));
    
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
    
    for (const key of allKeys) {
      if (matchesPattern(pattern, key)) {
        matchingKeys.push(key);
      }
    }
    
    this.logger.log('debug', `Found ${matchingKeys.length} keys matching pattern: ${pattern}`);
    return matchingKeys;
  }

  /**
   * Gets a value or values from the cache by key or pattern
   */
  async get(key: string): Promise<string | string[] | undefined> {
    if (!key?.length) {
      this.logger.log('debug', `Empty key provided to get() method`);
      return undefined;
    }

    this.logger.log('info', `Getting cache for key: ${key}`);

    const isPattern = key.includes("*");
    
    if (isPattern) {
      const matchingKeys = this.getMatchingKeys(key);
      if (!matchingKeys.length) {
        this.logger.log('debug', `No keys found matching pattern: ${key}`);
        return undefined;
      }

      // For patterns, get all matching values in parallel
      const results = await Promise.all(
        matchingKeys.map(async (matchedKey) => {
          try {
            return await this.getSingle(matchedKey);
          } catch (error) {
            this.logger.log('error', `Error getting cache for key: ${matchedKey}`, error);
            return undefined;
          }
        })
      );

      // Filter out undefined values from expired or errored keys
      const validResults = results.filter((result): result is string => result !== undefined);
      
      return validResults.length > 0 ? validResults : undefined;
    }
    
    // For single keys, just get the value directly
    return this.getSingle(key);
  }

  /**
   * Gets a single value from the cache by exact key
   */
  private async getSingle(key: string): Promise<string | undefined> {
    const cached = this.cache.get(key);
    
    if (!cached) {
      this.logger.log('debug', `Cache miss for key: ${key}`);
      return undefined;
    }

    // Check if the entry has expired
    if (isExpired(cached)) {
      this.logger.log('debug', `Cache expired for key: ${key}`);
      
      // For entries with autoRefetch, generate a new value in the background
      if (cached.autoRefetch && cached.sourceFn) {
        // Only initiate refetch if not already in progress
        if (!cached.fetching) {
          this.logger.log('debug', `Auto-refetching expired key: ${key}`);
          
          // Use Promise.resolve() to ensure proper microtask queue behavior for tests
          Promise.resolve().then(() => {
            return this.refetchSingle(key).catch(e => {
              this.logger.log('error', `Background refetch failed for key: ${key}`, e);
            });
          });
        } else {
          this.logger.log('debug', `Refetch already in progress for key: ${key}`);
        }
        
        // Return the stale value while refetching
        const value = cached.value;
        
        // Apply middleware
        const context: MiddlewareContext = {
          key,
          operation: 'get',
          value,
          ttl: cached.ttl,
          autoRefetch: cached.autoRefetch,
          timestamp: Date.now()
        };
        
        const processed = await this.middlewareManager.execute(value, context);
        if (processed === undefined) {
          this.logger.log('error', `Middleware returned undefined for stale key: ${key}`);
          throw new Error(`Middleware returned undefined for stale key: '${key}'`);
        }
        return processed;
      }
      
      // For non-autoRefetch entries, remove the entry and return undefined
      this.logger.log('debug', `Removing expired entry for key: ${key}`);
      this.deleteSingle(key);
      return undefined;
    }

    // Cache hit - only update access metadata for non-expired entries
    this.updateAccessMetadata(key);
    this.logger.log('debug', `Cache hit for key: ${key}`);
    const value = cached.value;
    
    // Apply middleware
    const context: MiddlewareContext = {
      key,
      operation: 'get',
      value,
      ttl: cached.ttl,
      autoRefetch: cached.autoRefetch,
      timestamp: Date.now()
    };
    
    const processed = await this.middlewareManager.execute(value, context);
    if (processed === undefined) {
      this.logger.log('error', `Middleware returned undefined for key: ${key}`);
      throw new Error(`Middleware returned undefined for key: '${key}'`);
    }
    return processed;
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

      try {
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
      } catch (e) {
        this.logger.log('error', `Error in wildcard refetch for pattern: ${key}`, e);
        throw e;
      }
    }

    // Handle single key
    return this.refetchSingle(key);
  }

  /**
   * Refetch a single key using its source function
   */
  private async refetchSingle(key: string): Promise<boolean> {
    const cached = this.cache.get(key);
    
    if (!cached) {
      this.logger.log('debug', `Key not found during refetch: ${key}`);
      return false;
    }
    
    if (!cached.sourceFn) {
      this.logger.log('debug', `No source function for key: ${key}`);
      return false;
    }
    
    // Skip if already fetching
    if (cached.fetching) {
      this.logger.log('debug', `Refetch already in progress for key: ${key}`);
      return false;
    }
    
    // Set the fetching flag to prevent concurrent refetches
    cached.fetching = true;
    this.cache.set(key, cached);
    
    try {
      this.logger.log('debug', `Refetching key: ${key}`);
      
      // Execute the source function
      let newValue: string;
      try {
        newValue = await cached.sourceFn();
      } catch (e) {
        this.logger.log('error', `Source function failed during refetch for key: ${key}`, e);
        
        // Emit the refetch failure event - IMPORTANT: Do this before throwing
        this.eventSystem.emitEvent(EVENT.REFETCH_FAILURE, {
          key,
          value: cached.value,
          createdAt: cached.createdAt,
          updatedAt: cached.updatedAt
        });
        
        // Reset the fetching flag before propagating the error
        cached.fetching = false;
        this.cache.set(key, cached);
        
        // Rethrow with more context
        throw new Error(`Source function failed for key: '${key}'`);
      }
      
      // Update timestamps before applying middleware
      const now = Date.now();
      
      // Emit the successful refetch event BEFORE applying middleware
      // This ensures tests can observe the event even if middleware fails
      this.eventSystem.emitEvent(EVENT.REFETCH, {
        key,
        value: newValue,
        createdAt: cached.createdAt,
        updatedAt: now
      });
      
      // Apply middleware
      const context: MiddlewareContext = {
        key,
        operation: 'refetch',
        value: newValue,
        ttl: cached.ttl,
        autoRefetch: cached.autoRefetch,
        timestamp: now
      };
      
      const processed = await this.middlewareManager.execute(newValue, context);
      if (processed === undefined) {
        this.logger.log('error', `Middleware returned undefined during refetch for key: ${key}`);
        throw new Error(`Middleware returned undefined during refetch for key: '${key}'`);
      }
      newValue = processed;
      
      // Clear the existing interval if present
      if (cached.interval) {
        clearTimeout(cached.interval);
      }
      
      // Create a new interval if TTL is specified
      let newInterval: ReturnType<typeof setTimeout> | undefined = undefined;
      
      if (cached.ttl) {
        newInterval = setTimeout(() => {
          this.logger.log('debug', `TTL expired for refetched key: ${key}`);
          this.eventSystem.emitEvent(EVENT.EXPIRE, {
            key,
            value: newValue,
            ttl: cached.ttl,
            createdAt: cached.createdAt,
            updatedAt: now,
          });
          
          if (cached.autoRefetch) {
            this.logger.log('debug', `Auto-refetching key after expiry: ${key}`);
            this.refetchSingle(key).catch(e => {
              this.logger.log('error', `Auto-refetch failed for key: ${key}`, e);
            });
          }
        }, cached.ttl);
      }
      
      // Update the cache entry
      this.cache.set(key, {
        ...cached,
        value: newValue,
        updatedAt: now,
        interval: newInterval,
        fetching: false,
      });
      
      this.logger.log('debug', `Successfully refetched key: ${key}`);
      
      return true;
    } catch (e) {
      // If it's not a source function error that we've already handled, reset the fetching flag
      if (!(e instanceof Error && e.message.startsWith(`Source function failed for key: '${key}'`))) {
        this.logger.log('error', `Refetch failed for key: ${key}`, e);
        
        // Reset the fetching flag
        cached.fetching = false;
        this.cache.set(key, cached);
      }
      
      // Propagate the error
      throw e;
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
      this.logger.log('debug', `Clearing timeout for key: ${key}`);
      clearTimeout(cache.interval);
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
        clearTimeout(interval);
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

    if (isExpired(cached)) {
      this.eventSystem.emitEvent(EVENT.EXPIRE, {
        key: key,
        value: cached.value,
        ttl: cached.ttl,
        createdAt: cached.createdAt,
        updatedAt: cached.updatedAt,
      });

      // Clean up expired entry to prevent memory leaks
      if (cached.interval) {
        this.logger.log('debug', `Clearing timeout for expired key: ${key}`);
        clearTimeout(cached.interval);
      }
      this.logger.log('debug', `Removing expired key during has() check: ${key}`);
      this.cache.delete(key);
      
      return false;
    }
    
    // Update access metadata for LRU/LFU - only for non-expired entries
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

  /**
   * Adds a middleware function to the middleware chain.
   * 
   * @param middleware - The middleware function to add
   * @returns The middleware manager for chaining
   */
  use(middleware: MiddlewareFunction): MiddlewareManager {
    return this.middlewareManager.use(middleware);
  }

  /**
   * Clears all middleware functions.
   * 
   * @returns The middleware manager for chaining
   */
  clearMiddleware(): MiddlewareManager {
    return this.middlewareManager.clear();
  }
} 