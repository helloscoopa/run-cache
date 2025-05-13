import { CacheConfig, EvictionPolicy } from '../types/cache-config';
import { CacheState, SourceFn } from '../types/cache-state';
import { EVENT, EventName, EventParam } from '../types/events';
import { Logger } from '../logging/logger';
import { EventSystem } from './event-system';
import { LFUPolicy, LRUPolicy } from '../policies/eviction-policies';
import {
  isExpired as originalIsExpired, matchesPattern, validateTTL, normalizeTag, normalizeTags,
} from './utils';
import { DefaultMiddlewareManager } from './middleware-manager';
import { MiddlewareContext, MiddlewareFunction, MiddlewareManager } from '../types/middleware';
import { StorageAdapter } from '../types/storage-adapter';

// Use the original isExpired function but add a custom wrapper for the simpler case
function isExpired(_cache: CacheState): boolean;
function isExpired(_updatedAt: number, _ttl: number): boolean;
function isExpired(cacheOrUpdatedAt: CacheState | number, ttl?: number): boolean {
  if (typeof cacheOrUpdatedAt === 'number' && ttl !== undefined) {
    // Handle the simple case with just timestamp and TTL
    return cacheOrUpdatedAt + ttl < Date.now();
  }
  // Use the original implementation for CacheState objects
  return originalIsExpired(cacheOrUpdatedAt as CacheState);
}

/**
 * Interface representing serialized cache data for persistence
 */
interface SerializedCacheData {
  /**
   * Version of the serialized data format
   */
  version: number;

  /**
   * Timestamp when the data was serialized
   */
  timestamp: number;

  /**
   * Serialized cache entries
   */
  entries: {
    [key: string]: {
      value: string;
      createdAt: number;
      updatedAt: number;
      ttl?: number;
      autoRefetch?: boolean;
      accessCount: number;
      lastAccessed: number;
      tags?: string[];
      dependencies?: string[];
      sourceFn?: string; // Serialized as string if available
    };
  };

  /**
   * Cache configuration
   */
  config: {
    maxEntries?: number;
    evictionPolicy?: string;
  };
}

/**
 * The core cache storage implementation handling cache operations
 */
export class CacheStore {
  private cache: Map<string, CacheState>;

  private config: CacheConfig;

  private logger: Logger;

  private eventSystem: EventSystem;

  private lruPolicy: LRUPolicy;

  private lfuPolicy: LFUPolicy;

  private middlewareManager: MiddlewareManager;

  private storageAdapter: StorageAdapter | null = null;

  private autoSaveInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Creates a new CacheStore instance.
   * Note: Use the static `create` method instead for proper initialization with storage adapters.
   * @param config Configuration options
   * @private
   */
  private constructor(config: CacheConfig = {}) {
    this.config = {
      maxEntries: Number.POSITIVE_INFINITY,
      evictionPolicy: EvictionPolicy.NONE,
      debug: false,
      ...config,
    };

    this.cache = new Map<string, CacheState>();
    this.logger = new Logger(this.config);
    this.eventSystem = new EventSystem(this.logger);
    this.middlewareManager = new DefaultMiddlewareManager(this.logger);

    // Initialize policies
    this.lruPolicy = new LRUPolicy(this.logger);
    this.lfuPolicy = new LFUPolicy(this.logger);

    // Initialize storage adapter if provided, but defer loading until create() method
    if (this.config.storageAdapter) {
      this.storageAdapter = this.config.storageAdapter;
    }
  }

  /**
   * Creates and initializes a new CacheStore instance with proper async storage loading.
   * This is the recommended way to create a CacheStore to ensure all data is loaded before use.
   *
   * @param config Configuration options
   * @returns A fully initialized CacheStore instance with data loaded from storage
   */
  static async create(config: CacheConfig = {}): Promise<CacheStore> {
    const store = new CacheStore(config);

    // Load from storage if a storage adapter is provided
    if (store.storageAdapter) {
      try {
        await store.loadFromStorage();
      } catch (error) {
        store.logger.log('error', 'Failed to load cache data from storage', error);
      }
    }

    return store;
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
    tags,
    dependencies,
  }: {
    key: string;
    value?: string;
    ttl?: number;
    autoRefetch?: boolean;
    sourceFn?: SourceFn;
    tags?: string[];
    dependencies?: string[];
  }): Promise<boolean> {
    if (!key?.length) {
      this.logger.log('error', 'Empty key provided to set() method');
      throw new Error('Empty key');
    }

    if (sourceFn === undefined && (value === undefined || !value.length)) {
      this.logger.log('error', `Neither value nor sourceFn provided to set() method for key: ${key}`);
      throw new Error("`value` can't be empty without a `sourceFn`");
    }

    if (autoRefetch && !ttl) {
      this.logger.log('error', `autoRefetch enabled without ttl for key: ${key}`);
      throw new Error('`autoRefetch` is not allowed without a `ttl`');
    }

    // Validate that TTL is positive if provided
    try {
      validateTTL(ttl, key);
    } catch (error) {
      this.logger.log('error', `Invalid ttl provided for key: ${key}`, { ttl });
      throw error;
    }

    // Validate tags array
    if (tags) {
      if (!Array.isArray(tags)) {
        this.logger.log('error', `Invalid tags provided for key: ${key}, must be an array`);
        throw new Error('`tags` must be an array');
      }

      // Create a set to check for duplicates
      const tagSet = new Set<string>();

      for (const tag of tags) {
        // Check if tag is a non-empty string
        if (typeof tag !== 'string' || !tag.trim().length) {
          this.logger.log('error', `Invalid tag provided for key: ${key}, each tag must be a non-empty string`);
          throw new Error('Each tag must be a non-empty string');
        }

        // Normalize tag
        const normalizedTag = normalizeTag(tag);

        // Check for duplicates
        if (tagSet.has(normalizedTag)) {
          this.logger.log('error', `Duplicate tag "${tag}" provided for key: ${key}`);
          throw new Error(`Duplicate tag "${tag}" detected`);
        }

        tagSet.add(normalizedTag);
      }
    }

    // Validate dependencies array
    if (dependencies) {
      if (!Array.isArray(dependencies)) {
        this.logger.log('error', `Invalid dependencies provided for key: ${key}, must be an array`);
        throw new Error('`dependencies` must be an array');
      }

      // Create a set to check for duplicates
      const depSet = new Set<string>();

      for (const dep of dependencies) {
        // Check if dependency is a non-empty string
        if (typeof dep !== 'string' || !dep.trim().length) {
          this.logger.log('error', `Invalid dependency provided for key: ${key}, each dependency must be a non-empty string`);
          throw new Error('Each dependency must be a non-empty string');
        }

        // Check for duplicates
        if (depSet.has(dep)) {
          this.logger.log('error', `Duplicate dependency "${dep}" provided for key: ${key}`);
          throw new Error(`Duplicate dependency "${dep}" detected`);
        }

        depSet.add(dep);
      }

      // Check if a dependency references the key itself (creates a self-loop)
      if (dependencies.includes(key)) {
        this.logger.log(
          'error',
          `Self-referential dependency detected for key: ${key}`,
        );
        throw new Error('A key cannot depend on itself');
      }
    }

    const time = Date.now();

    this.logger.log('info', `Setting cache for key: ${key}`, {
      hasTtl: ttl !== undefined,
      ttl,
      hasValue: value !== undefined,
      hasSourceFn: sourceFn !== undefined,
      autoRefetch,
      hasTags: tags !== undefined && tags.length > 0,
      hasDependencies: dependencies !== undefined && dependencies.length > 0,
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
        this.eventSystem.emitEvent(
          EVENT.EXPIRE,
          {
            key,
            value: value ?? 'undefined',
            createdAt: time,
            updatedAt: time,
            _params: { ttl },
          },
        );

        if (typeof sourceFn === 'function' && autoRefetch) {
          this.logger.log('debug', `Auto-refetching key: ${key}`);
          this.refetchSingle(key).catch((e) => {
            this.logger.log('error', `Auto-refetch failed for key: ${key}`, e);
            /* Ignore as the event is already emitted inside the function */
          });
        }
      }, ttl);
    }

    let cacheValue = value;

    if (value === undefined && typeof sourceFn === 'function') {
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
        timestamp: time,
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
    const maxEntries = this.config.maxEntries ?? Number.POSITIVE_INFINITY;
    if (this.cache.size >= maxEntries
        && !this.cache.has(key)
        && this.config.evictionPolicy !== EvictionPolicy.NONE) {
      // We're adding a new key and we're already at max size, so evict one
      this.logger.log('info', `Cache at capacity, evicting one entry before adding key: ${key}`);
      this.enforceEvictionPolicy(1);
    }

    // Set up proper access metadata - preserve existing metadata for updates
    const accessCount = existingCache ? existingCache.accessCount : 0;
    const lastAccessed = existingCache ? existingCache.lastAccessed : time;

    // Process and sanitize tags and dependencies
    const finalTags = tags ? normalizeTags(tags) : (existingCache?.tags || []);
    const finalDependencies = dependencies ? [...dependencies] : (existingCache?.dependencies || []);

    this.cache.set(key, {
      value: cacheValue ?? 'undefined',
      ttl,
      sourceFn,
      autoRefetch,
      interval: interval || undefined,
      createdAt: time,
      updatedAt: time,
      // Initialize access metadata for eviction policies
      accessCount,
      lastAccessed,
      // Add tags and dependencies
      tags: finalTags,
      dependencies: finalDependencies,
    });

    this.logger.log('debug', `Cache entry set successfully for key: ${key}`, {
      newSize: this.cache.size,
      maxEntries: this.config.maxEntries,
      tags: finalTags,
      dependencies: finalDependencies,
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
        after: { lastAccessed: cached.lastAccessed, accessCount: cached.accessCount },
      });
    }
    this.enforceEvictionPolicy();
  }

  /**
   * Enforces the configured eviction policy if needed
   */
  private enforceEvictionPolicy(forcedCount?: number): void {
    // Skip if the cache isn't full yet and there's no forced count
    const maxEntries = this.config.maxEntries ?? Number.POSITIVE_INFINITY;
    if (!forcedCount && this.cache.size <= maxEntries) {
      return;
    }

    // Number of entries to evict
    const entriesToEvict = forcedCount ?? Math.max(0, this.cache.size - maxEntries);

    if (entriesToEvict <= 0) {
      return;
    }

    this.logger.log('info', `Cache size (${this.cache.size}) exceeds max size (${maxEntries}), `
      + `evicting ${entriesToEvict} entries using ${this.config.evictionPolicy} policy`);

    // Choose eviction strategy based on configuration
    let keysToEvict: string[] = [];

    switch (this.config.evictionPolicy) {
      case EvictionPolicy.LRU:
        keysToEvict = this.lruPolicy.getEntriesToEvict(
          Array.from(this.cache.entries()),
          entriesToEvict,
        );
        break;
      case EvictionPolicy.LFU:
        keysToEvict = this.lfuPolicy.getEntriesToEvict(
          Array.from(this.cache.entries()),
          entriesToEvict,
        );
        break;
      case EvictionPolicy.NONE:
      default:
        // No automatic eviction
        this.logger.log('debug', 'Skipping eviction as policy is set to NONE');
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
    if (!pattern.includes('*')) {
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
      this.logger.log('debug', 'Empty key provided to get() method');
      return undefined;
    }

    this.logger.log('info', `Getting cache for key: ${key}`);

    const isPattern = key.includes('*');

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
        }),
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
    if (cached.ttl && isExpired(cached.updatedAt, cached.ttl)) {
      this.logger.log('debug', `Cache expired for key: ${key}`);

      // For entries with autoRefetch, generate a new value in the background
      if (cached.autoRefetch && cached.sourceFn) {
        // Only initiate refetch if not already in progress
        if (!cached.fetching) {
          this.logger.log('debug', `Auto-refetching expired key: ${key}`);

          // Use Promise.resolve() to ensure proper microtask queue behavior for tests
          Promise.resolve().then(() => this.refetchSingle(key).catch((e) => {
            this.logger.log('error', `Background refetch failed for key: ${key}`, e);
          }));
        } else {
          this.logger.log('debug', `Refetch already in progress for key: ${key}`);
        }

        // Return the stale value while refetching
        const { value } = cached;

        // Apply middleware
        const context: MiddlewareContext = {
          key,
          operation: 'get',
          value,
          ttl: cached.ttl,
          autoRefetch: cached.autoRefetch,
          timestamp: Date.now(),
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
    const { value } = cached;

    // Apply middleware
    const context: MiddlewareContext = {
      key,
      operation: 'get',
      value,
      ttl: cached.ttl,
      autoRefetch: cached.autoRefetch,
      timestamp: Date.now(),
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
    if (key.includes('*')) {
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
          }),
        );

        // Return true if any refetch was successful
        const anySuccessful = results.some((result) => result === true);
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

        // Emit event
        await this.eventSystem.emitEvent(
          EVENT.REFETCH_FAILURE,
          {
            key,
            value: cached.value,
            createdAt: cached.createdAt,
            updatedAt: cached.updatedAt,
          },
        );

        // Reset the fetching flag before propagating the error
        cached.fetching = false;
        this.cache.set(key, cached);

        // Rethrow with more context
        throw new Error(`Source function failed for key: '${key}'`);
      }

      // Update timestamps before applying middleware
      const now = Date.now();

      // Emit event
      await this.eventSystem.emitEvent(
        EVENT.REFETCH,
        {
          key,
          value: newValue,
          createdAt: now,
          updatedAt: now,
        },
      );

      // Apply middleware
      const context: MiddlewareContext = {
        key,
        operation: 'refetch',
        value: newValue,
        ttl: cached.ttl,
        autoRefetch: cached.autoRefetch,
        timestamp: now,
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
      let newInterval: ReturnType<typeof setTimeout> | undefined;

      if (cached.ttl) {
        newInterval = setTimeout(() => {
          this.logger.log('debug', `TTL expired for refetched key: ${key}`);
          this.eventSystem.emitEvent(
            EVENT.EXPIRE,
            {
              key,
              value: newValue,
              createdAt: now,
              updatedAt: now,
            },
          );

          if (cached.autoRefetch) {
            this.logger.log('debug', `Auto-refetching key after expiry: ${key}`);
            this.refetchSingle(key).catch((e) => {
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
    if (key.includes('*')) {
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
    if (key.includes('*')) {
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

    if (cached.ttl && isExpired(cached.updatedAt, cached.ttl)) {
      this.eventSystem.emitEvent(
        EVENT.EXPIRE,
        {
          key,
          value: cached.value,
          createdAt: cached.createdAt,
          updatedAt: cached.updatedAt,
        },
      );

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
   * Configures the cache store
   */
  async configure(config: CacheConfig): Promise<void> {
    // Update configuration
    this.config = {
      ...this.config,
      ...config,
    };

    // Update logger
    this.logger.updateConfig(this.config);

    // Update storage adapter if provided
    if ('storage' in config) {
      // If we're replacing the storage adapter, save current data first
      if (this.storageAdapter) {
        try {
          await this.saveToStorage();
        } catch (error) {
          this.logger.log('error', 'Failed to save cache data before changing storage adapter', error);
        }
      }

      this.storageAdapter = config.storageAdapter ?? null;

      // If the new adapter is null/undefined we're done
      if (!this.storageAdapter) {
        return;
      }

      // Load from new storage
      try {
        await this.loadFromStorage();
      } catch (error) {
        this.logger.log('error', 'Failed to load cache data from new storage adapter', error);
      }
    }
  }

  /**
   * Gets the current configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  /**
   * Registers a callback function to be called when a global expiry event occurs.
   */
  onExpiry(callback: (_event: EventParam) => void | Promise<void>): void {
    this.eventSystem.onExpiry(callback);
  }

  /**
   * Registers a callback function to be called when an expiry event occurs for a specific key.
   */
  onKeyExpiry(key: string, callback: (_event: EventParam) => void | Promise<void>): void {
    if (!key?.length) {
      this.logger.log('error', 'Empty key provided to onKeyExpiry() method');
      throw Error('Empty key');
    }
    this.eventSystem.onKeyExpiry(key, callback);
  }

  /**
   * Registers a callback function to be called when a global refetch event occurs.
   */
  onRefetch(callback: (_event: EventParam) => void | Promise<void>): void {
    this.eventSystem.onRefetch(callback);
  }

  /**
   * Registers a callback function to be called when a refetch event occurs for a specific key.
   */
  onKeyRefetch(key: string, callback: (_event: EventParam) => void | Promise<void>): void {
    if (!key?.length) {
      this.logger.log('error', 'Empty key provided to onKeyRefetch() method');
      throw Error('Empty key');
    }
    this.eventSystem.onKeyRefetch(key, callback);
  }

  /**
   * Registers a callback function to be called when a global refetch failure event occurs.
   */
  onRefetchFailure(callback: (_event: EventParam) => void | Promise<void>): void {
    this.eventSystem.onRefetchFailure(callback);
  }

  /**
   * Registers a callback function to be called when a refetch failure event occurs for a specific key.
   */
  onKeyRefetchFailure(key: string, callback: (_event: EventParam) => void | Promise<void>): void {
    if (!key?.length) {
      this.logger.log('error', 'Empty key provided to onKeyRefetchFailure() method');
      throw Error('Empty key');
    }
    this.eventSystem.onKeyRefetchFailure(key, callback);
  }

  /**
   * Registers a callback function to be called when a global tag invalidation event occurs.
   */
  onTagInvalidation(callback: (_event: EventParam) => void | Promise<void>): void {
    this.eventSystem.onTagInvalidation(callback);
  }

  /**
   * Registers a callback function to be called when a tag invalidation event occurs for a specific key.
   */
  onKeyTagInvalidation(key: string, callback: (_event: EventParam) => void | Promise<void>): void {
    if (!key?.length) {
      this.logger.log('error', 'Empty key provided to onKeyTagInvalidation() method');
      throw Error('Empty key');
    }
    this.eventSystem.onKeyTagInvalidation(key, callback);
  }

  /**
   * Registers a callback function to be called when a global dependency invalidation event occurs.
   */
  onDependencyInvalidation(callback: (_event: EventParam) => void | Promise<void>): void {
    this.eventSystem.onDependencyInvalidation(callback);
  }

  /**
   * Registers a callback function to be called when a dependency invalidation event occurs for a specific key.
   */
  onKeyDependencyInvalidation(key: string, callback: (_event: EventParam) => void | Promise<void>): void {
    if (!key?.length) {
      this.logger.log('error', 'Empty key provided to onKeyDependencyInvalidation() method');
      throw Error('Empty key');
    }
    this.eventSystem.onKeyDependencyInvalidation(key, callback);
  }

  /**
   * Clears all event listeners or filters by event type and/or key pattern.
   */
  clearEventListeners(params?: { event?: EventName; key?: string }): boolean {
    return this.eventSystem.clearEventListeners(params);
  }

  /**
   * Serializes the current cache state for storage
   */
  private serializeCache(): string {
    const entries: { [key: string]: any } = {};
    for (const [key, state] of this.cache.entries()) {
      entries[key] = {
        value: state.value,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
        ttl: state.ttl,
        autoRefetch: state.autoRefetch,
        accessCount: state.accessCount,
        lastAccessed: state.lastAccessed,
        tags: state.tags,
        dependencies: state.dependencies,
        sourceFn: state.sourceFn ? state.sourceFn.toString() : undefined,
      };
    }

    const data: SerializedCacheData = {
      version: 1,
      timestamp: Date.now(),
      entries,
      config: {
        maxEntries: this.config.maxEntries,
        evictionPolicy: this.config.evictionPolicy,
      },
    };

    return JSON.stringify(data);
  }

  /**
   * Deserializes the cached data from storage
   * @param data The serialized cache data
   */
  private deserializeCache(data: string): void {
    try {
      const parsed: SerializedCacheData = JSON.parse(data);

      // Check data version
      if (parsed.version !== 1) {
        throw new Error(`Unsupported cache data version: ${parsed.version}`);
      }

      // Clear existing cache
      this.flush();

      // Restore config
      if (parsed.config) {
        if (parsed.config.maxEntries !== undefined) {
          this.config.maxEntries = parsed.config.maxEntries;
        }

        if (parsed.config.evictionPolicy) {
          this.config.evictionPolicy = parsed.config.evictionPolicy as EvictionPolicy;
        }
      }

      // Restore entries
      if (parsed.entries) {
        for (const [key, entry] of Object.entries(parsed.entries)) {
          const state: CacheState = {
            value: entry.value,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
            ttl: entry.ttl,
            autoRefetch: entry.autoRefetch,
            accessCount: entry.accessCount,
            lastAccessed: entry.lastAccessed,
            tags: entry.tags,
            dependencies: entry.dependencies,
          };

          this.cache.set(key, state);
        }
      }

      this.logger.log('info', `Restored ${this.cache.size} cache entries from storage`);
    } catch (error) {
      throw new Error(`Failed to deserialize cache data: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  /**
   * Sets up an expiry interval for a cache entry
   */
  private setExpiryInterval(key: string, state: CacheState): void {
    // Skip if no TTL
    if (!state.ttl) {
      return;
    }

    // Calculate remaining time based on last update
    const elapsed = Date.now() - state.updatedAt;
    const remainingTime = state.ttl - elapsed;

    // If already expired, handle expiration immediately
    if (remainingTime <= 0) {
      this.handleExpiry(key, state);
      return;
    }

    // Otherwise set timeout for remaining time
    state.interval = setTimeout(() => {
      this.handleExpiry(key, state);
    }, remainingTime);
  }

  /**
   * Handles expiry of a cache entry
   */
  private handleExpiry(key: string, state: CacheState): void {
    this.logger.log('debug', `TTL expired for key: ${key}`);

    this.eventSystem.emitEvent(
      EVENT.EXPIRE,
      {
        key,
        value: state.value,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      },
    );

    if (typeof state.sourceFn === 'function' && state.autoRefetch) {
      this.logger.log('debug', `Auto-refetching key: ${key}`);
      this.refetchSingle(key).catch((e) => {
        this.logger.log('error', `Auto-refetch failed for key: ${key}`, e);
        /* Ignore as the event is already emitted inside the function */
      });
    }
  }

  /**
   * Saves the current cache state to storage if a storage adapter is configured
   */
  async saveToStorage(): Promise<boolean> {
    if (!this.storageAdapter) {
      return false;
    }

    try {
      // Serialize the cache data
      const serializedData = this.serializeCache();

      // Save to storage
      await this.storageAdapter.save(serializedData);
      this.logger.log('debug', `Cache data saved to storage (${serializedData.length} bytes)`);
      return true;
    } catch (error) {
      this.logger.log('error', 'Failed to save cache data to storage', error);
      return false;
    }
  }

  /**
   * Loads cache state from storage if a storage adapter is configured
   */
  async loadFromStorage(): Promise<boolean> {
    if (!this.storageAdapter) {
      return false;
    }

    try {
      // Load from storage
      const data = await this.storageAdapter.load();

      if (!data) {
        this.logger.log('info', 'No cached data found in storage');
        return false;
      }

      // Deserialize and restore cache
      this.deserializeCache(data);
      return true;
    } catch (error) {
      this.logger.log('error', 'Failed to load cache data from storage', error);
      return false;
    }
  }

  /**
   * Sets up auto-save interval for persistent storage
   * @param intervalMs Milliseconds between auto-saves, or 0 to disable
   */
  setupAutoSave(intervalMs: number): void {
    // Clear existing interval if any
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }

    // Setup new interval if storage adapter exists and interval > 0
    if (this.storageAdapter && intervalMs > 0) {
      this.autoSaveInterval = setInterval(() => {
        this.saveToStorage().catch((error) => {
          this.logger.log('error', 'Auto-save failed', error);
        });
      }, intervalMs);
    }
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

  /**
   * Invalidates all cache entries that have been tagged with the specified tag.
   * Returns true if at least one entry was invalidated, false otherwise.
   *
   * @param {string} tag - The tag to invalidate
   * @returns {boolean} - Whether any entries were invalidated
   */
  invalidateByTag(tag: string): boolean {
    if (!tag || !tag.length) {
      this.logger.log('error', 'Empty tag provided to invalidateByTag() method');
      return false;
    }

    // Normalize the tag for consistent comparison
    const normalizedTag = normalizeTag(tag);
    this.logger.log('info', `Invalidating cache entries with tag: ${normalizedTag}`);

    let invalidated = false;

    // Find all keys that have the specified tag
    for (const [key, cacheState] of this.cache.entries()) {
      if (cacheState.tags && cacheState.tags.includes(normalizedTag)) {
        this.logger.log('debug', `Invalidating ${key} due to tag match: ${normalizedTag}`);

        // Emit event before deleting
        this.eventSystem.emitEvent(
          EVENT.TAG_INVALIDATION,
          {
            key,
            value: cacheState.value,
            createdAt: cacheState.createdAt,
            updatedAt: cacheState.updatedAt,
            tag: normalizedTag,
            _params: { tag: normalizedTag },
          },
        );

        this.deleteSingle(key);
        invalidated = true;
      }
    }

    if (invalidated) {
      this.logger.log('info', `Successfully invalidated entries with tag: ${normalizedTag}`);
    } else {
      this.logger.log('debug', `No entries found with tag: ${normalizedTag}`);
    }

    return invalidated;
  }

  /**
   * Invalidates all cache entries that depend on the specified key.
   * Returns true if at least one entry was invalidated, false otherwise.
   *
   * @param {string} key - The dependency key to invalidate by
   * @returns {boolean} - Whether any entries were invalidated
   */
  invalidateByDependency(key: string): boolean {
    if (!key || !key.length) {
      this.logger.log('error', 'Empty key provided to invalidateByDependency() method');
      return false;
    }

    this.logger.log('info', `Invalidating cache entries dependent on key: ${key}`);

    let invalidated = false;
    const invalidatedKeys = new Set<string>();

    // First pass: find all keys that directly depend on the specified key
    for (const [entryKey, cacheState] of this.cache.entries()) {
      if (cacheState.dependencies && cacheState.dependencies.includes(key)) {
        this.logger.log('debug', `Invalidating ${entryKey} due to dependency on: ${key}`);
        invalidatedKeys.add(entryKey);
        invalidated = true;
      }
    }

    // Second pass: look for cascade effects (entries depending on entries we're invalidating)
    let newDependencies = true;
    const processedKeys = new Set<string>();

    // Continue finding dependencies until no new ones are found
    while (newDependencies) {
      newDependencies = false;
      const currentKeys = Array.from(invalidatedKeys).filter((k) => !processedKeys.has(k));

      for (const dependentKey of currentKeys) {
        processedKeys.add(dependentKey);

        // Find any entries that depend on this key
        for (const [entryKey, cacheState] of this.cache.entries()) {
          if (invalidatedKeys.has(entryKey)) continue; // Skip already invalidated entries

          if (cacheState.dependencies && cacheState.dependencies.includes(dependentKey)) {
            this.logger.log('debug', `Cascade invalidating ${entryKey} due to dependency on: ${dependentKey}`);
            invalidatedKeys.add(entryKey);
            newDependencies = true;
            invalidated = true;
          }
        }
      }
    }

    // Delete all invalidated keys
    for (const invalidKey of invalidatedKeys) {
      const cacheState = this.cache.get(invalidKey);
      if (cacheState) {
        // Emit event before deleting
        this.eventSystem.emitEvent(
          EVENT.DEPENDENCY_INVALIDATION,
          {
            key: invalidKey,
            value: cacheState.value,
            createdAt: cacheState.createdAt,
            updatedAt: cacheState.updatedAt,
            dependencyKey: key,
            _params: { dependencyKey: key },
          },
        );

        this.deleteSingle(invalidKey);
      }
    }

    if (invalidated) {
      this.logger.log('info', `Successfully invalidated ${invalidatedKeys.size} entries dependent on: ${key}`);
    } else {
      this.logger.log('debug', `No entries found dependent on: ${key}`);
    }

    return invalidated;
  }

  /**
   * Checks if the target key depends on the specified dependency key.
   *
   * @param {string} targetKey - The key to check for dependencies
   * @param {string} dependencyKey - The dependency key to look for
   * @param {Set<string>} [visited] - Set of already visited keys to prevent infinite recursion
   * @returns {Promise<boolean>} - Whether targetKey depends on dependencyKey
   */
  async isDependencyOf(
    targetKey: string,
    dependencyKey: string,
    visited: Set<string> = new Set(),
  ): Promise<boolean> {
    if (!targetKey || !targetKey.length || !dependencyKey || !dependencyKey.length) {
      this.logger.log('error', 'Empty key provided to isDependencyOf() method');
      return false;
    }

    this.logger.log('debug', `Checking if ${targetKey} depends on ${dependencyKey}`);

    // Check if we've already visited this node to prevent infinite recursion
    if (visited.has(targetKey)) {
      this.logger.log('debug', `Already visited ${targetKey}, stopping recursion`);
      return false;
    }

    // Add current target to visited set
    visited.add(targetKey);

    // Check if target key exists and is not expired
    if (!(await this.hasSingle(targetKey))) {
      this.logger.log('debug', `Target key ${targetKey} does not exist or is expired`);
      return false;
    }

    const cacheState = this.cache.get(targetKey);
    if (!cacheState || !cacheState.dependencies || cacheState.dependencies.length === 0) {
      return false;
    }

    // Check for direct dependency
    if (cacheState.dependencies.includes(dependencyKey)) {
      return true;
    }

    // Check for indirect dependencies (recursive check)
    for (const dependency of cacheState.dependencies) {
      if (await this.isDependencyOf(dependency, dependencyKey, visited)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Shuts down the cache store, clearing resources and saving data if persistence is enabled
   */
  async shutdown(): Promise<void> {
    // Save to persistent storage if available
    if (this.storageAdapter) {
      try {
        // Properly await the saveToStorage operation
        await this.saveToStorage();
      } catch (error) {
        this.logger.log('error', 'Failed to save cache data during shutdown', error);
      }
    }

    // Clear auto-save interval if set
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }

    // Clear all timeouts
    for (const cacheItem of this.cache.values()) {
      if (cacheItem?.interval) {
        clearTimeout(cacheItem.interval);
        cacheItem.interval = undefined;
      }
    }

    // Clear the cache
    this.cache.clear();

    // Clear all event listeners
    this.clearEventListeners();

    // Detach persistence
    this.storageAdapter = null;

    // Defensive: ensure auto-save interval is cleared
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }
}
