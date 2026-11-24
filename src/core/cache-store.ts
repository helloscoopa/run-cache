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
import { SerializationManager } from './serialization';
import { createExpiryTimer, ExpiryTimer } from './timer';

/**
 * Lets the Node.js process exit while a native timer (the auto-save interval) is
 * pending. Expiry timers use ExpiryTimer.unref(), which also covers re-armed chunks.
 * No-op in browsers, where timer handles are numbers.
 */
function unrefTimer(timer: unknown): void {
  if (timer && typeof timer === 'object' && typeof (timer as { unref?: unknown }).unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
}

// Use the original isExpired function but add a custom wrapper for the simpler case
function isExpired(_cache: CacheState<string>): boolean;
function isExpired(_updatedAt: number, _ttl: number): boolean;
function isExpired(cacheOrUpdatedAt: CacheState<string> | number, ttl?: number): boolean {
  if (typeof cacheOrUpdatedAt === 'number' && ttl !== undefined) {
    // Handle the simple case with just timestamp and TTL
    return cacheOrUpdatedAt + ttl < Date.now();
  }
  // Use the original implementation for CacheState objects
  return originalIsExpired(cacheOrUpdatedAt as CacheState<string>);
}

/**
 * A stored value as read from the cache, with whether it must be deserialized
 */
interface StoredRead {
  value: string;
  serialized: boolean;
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
      serialized?: boolean;
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
  private cache: Map<string, CacheState<string>>;

  private config: CacheConfig;

  private logger: Logger;

  private eventSystem: EventSystem;

  private lruPolicy: LRUPolicy;

  private lfuPolicy: LFUPolicy;

  private middlewareManager: MiddlewareManager<string | undefined>;

  private storageAdapter: StorageAdapter | null = null;

  private autoSaveInterval: ReturnType<typeof setInterval> | null = null;

  private serialization: SerializationManager;

  /** Monotonic counter used to order concurrent set() calls */
  private setSequence = 0;

  /** Number of set() calls currently in flight per key */
  private inFlightSets = new Map<string, number>();

  /**
   * Highest sequence number written by a set() per key, kept only while other set()
   * calls for that key are still in flight. A call that finishes later with a lower
   * sequence number started earlier and must not overwrite the newer value.
   */
  private appliedSets = new Map<string, number>();

  /**
   * Reverse dependency index: for each key, the keys of entries that list it in their
   * `dependencies`. Keeps dependency invalidation proportional to the number of
   * dependents (and free when no entry declares dependencies).
   */
  private dependents = new Map<string, Set<string>>();

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

    this.cache = new Map<string, CacheState<string>>();
    this.logger = new Logger(this.config);
    this.eventSystem = new EventSystem(this.logger);
    this.middlewareManager = new DefaultMiddlewareManager<string | undefined>(this.logger);
    this.serialization = new SerializationManager();

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
    value?: unknown;
    ttl?: number;
    autoRefetch?: boolean;
    sourceFn?: SourceFn<unknown>;
    tags?: string[];
    dependencies?: string[];
  }): Promise<boolean> {
    if (!key?.length) {
      this.logger.log('error', 'Empty key provided to set() method');
      throw new Error('Empty key');
    }

    if (sourceFn === undefined && (value === undefined || (typeof value === 'string' && !value.length))) {
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

      // Reject longer cycles (A -> B -> A), which would make invalidation ambiguous
      const cycleVia = dependencies.find((dep) => this.dependsTransitively(dep, key));
      if (cycleVia !== undefined) {
        this.logger.log('error', `Circular dependency detected for key: ${key} via ${cycleVia}`);
        throw new Error(`Circular dependency detected: "${cycleVia}" already depends on "${key}"`);
      }
    }

    const time = Date.now();
    const directValue = value === undefined ? undefined : this.encodeValue(value);
    const sequence = ++this.setSequence;
    this.inFlightSets.set(key, (this.inFlightSets.get(key) ?? 0) + 1);

    this.logger.log('info', `Setting cache for key: ${key}`, {
      hasTtl: ttl !== undefined,
      ttl,
      hasValue: value !== undefined,
      hasSourceFn: sourceFn !== undefined,
      autoRefetch,
      hasTags: tags !== undefined && tags.length > 0,
      hasDependencies: dependencies !== undefined && dependencies.length > 0,
    });

    let cacheValue = directValue?.value;
    let serialized = directValue?.serialized ?? false;

    if (value === undefined && typeof sourceFn === 'function') {
      try {
        this.logger.log('debug', `Fetching value using sourceFn for key: ${key}`);
        const encoded = this.encodeValue(await sourceFn());
        cacheValue = encoded.value;
        serialized = encoded.serialized;
        this.logger.log('debug', `Successfully fetched value using sourceFn for key: ${key}`);
      } catch (e) {
        this.logger.log('error', `Source function failed for key: ${key}`, e);
        this.finishSet(key);
        throw new Error(`Source function failed for key: '${key}'`);
      }
    }

    // Apply middleware to the value before storing it
    try {
      const context: MiddlewareContext<string | undefined> = {
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
      this.finishSet(key);
      throw new Error(`Middleware execution failed for key: '${key}'`);
    }

    // A set() for the same key that started later has already written its value;
    // writing now would replace newer data with older data. A later set() that failed,
    // or has not finished yet, does not block this one.
    if ((this.appliedSets.get(key) ?? 0) > sequence) {
      this.logger.log('debug', `Discarding superseded set() for key: ${key}`);
      this.finishSet(key);
      return false;
    }
    this.appliedSets.set(key, sequence);
    this.finishSet(key);

    // The value is resolved, so nothing below can fail. Only now replace the
    // existing entry's timer: a failed sourceFn or middleware above must leave the
    // current entry, including its expiry timer, untouched and create no new timer.
    // The entry is read here (not before the awaits) so it reflects the live state.
    const existingCache = this.cache.get(key);

    // Timestamp the entry now, when its TTL timer starts, so lazy expiry checks
    // (updatedAt + ttl) and the timer agree on one expiry time even if the value
    // took a while to fetch.
    const writtenAt = Date.now();
    if (existingCache?.interval) {
      this.logger.log('debug', `Clearing existing interval for key: ${key}`);
      existingCache.interval.clear();
    }

    let interval: ExpiryTimer | null = null;

    if (ttl !== undefined) {
      this.logger.log('debug', `Setting expiry interval for key: ${key}, ttl: ${ttl}ms`);
      interval = createExpiryTimer(() => {
        // Only act if this timer still belongs to the live entry; it may have been
        // replaced by a later set() or refetch.
        const current = this.cache.get(key);
        if (!current || current.interval !== interval) {
          return;
        }
        this.logger.log('debug', `TTL expired for key: ${key}`);
        this.emitExpiry(key, current);

        if (typeof sourceFn === 'function' && autoRefetch) {
          this.logger.log('debug', `Auto-refetching key: ${key}`);
          this.refetchSingle(key).catch((e) => {
            this.logger.log('error', `Auto-refetch failed for key: ${key}`, e);
            /* Ignore as the event is already emitted inside the function */
          });
        } else if (typeof sourceFn !== 'function') {
          // Removing the entry also invalidates its dependents
          this.removeExpiredEntry(key, interval);
        } else {
          // Entries with a sourceFn are kept so they can still be refetched manually,
          // but their value is no longer valid, so neither is anything derived from it.
          // Auto-refetched entries invalidate their dependents when the refetch lands.
          this.invalidateDependentsOf(key);
        }
      }, ttl);
      interval.unref();
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

    // Set up access metadata. The access count is preserved for updates; a write
    // always counts as the most recent use for LRU purposes.
    const accessCount = existingCache ? existingCache.accessCount : 0;
    const lastAccessed = writtenAt;

    // Process and sanitize tags and dependencies
    const finalTags = tags ? normalizeTags(tags) : (existingCache?.tags || []);
    const finalDependencies = dependencies ? [...dependencies] : (existingCache?.dependencies || []);

    // Replace this key's edges in the reverse dependency index. The live entry is read
    // here (not the one captured before the awaits) so the index matches what is replaced.
    this.unindexDependencies(key, this.cache.get(key)?.dependencies);
    this.indexDependencies(key, finalDependencies);

    // Re-insert so the Map's iteration order stays least- to most-recently-used
    this.cache.delete(key);
    this.cache.set(key, {
      value: cacheValue ?? 'undefined',
      serialized,
      ttl,
      sourceFn: sourceFn as SourceFn<string> | undefined,
      autoRefetch,
      interval: interval || undefined,
      createdAt: writtenAt,
      updatedAt: writtenAt,
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

    // An updated entry invalidates everything derived from its previous value
    if (existingCache) {
      this.invalidateDependentsOf(key);
    }

    // Double-check after adding to ensure we're not over the limit
    this.enforceEvictionPolicy();
    return true;
  }

  /**
   * Emits the expire event for an entry, at most once per version of the entry.
   * The payload always reflects the stored value and includes the entry's TTL.
   */
  private emitExpiry(key: string, state: CacheState<string>): void {
    if (state.expiryEmitted) {
      return;
    }
    state.expiryEmitted = true;
    this.eventSystem.emitEvent(
      EVENT.EXPIRE,
      {
        key,
        value: state.value,
        ttl: state.ttl,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      },
    );
  }

  /**
   * Removes an entry whose TTL timer has fired, unless the entry has since been
   * replaced (its timer is then a different one) or already removed.
   */
  private removeExpiredEntry(key: string, timer: ExpiryTimer | null | undefined): void {
    const current = this.cache.get(key);
    if (!current || !timer || current.interval !== timer) {
      return;
    }
    this.logger.log('debug', `Removing expired entry for key: ${key}`);
    this.deleteSingle(key);
  }

  /**
   * Marks one in-flight set() for `key` as finished (written, discarded or failed).
   * Ordering state for the key is dropped once no set() for it is in flight.
   */
  private finishSet(key: string): void {
    const remaining = (this.inFlightSets.get(key) ?? 1) - 1;
    if (remaining > 0) {
      this.inFlightSets.set(key, remaining);
      return;
    }
    this.inFlightSets.delete(key);
    this.appliedSets.delete(key);
  }

  /**
   * Returns true if `entry` is still the live cache entry for `key`
   */
  private isCurrentEntry(key: string, entry: CacheState<string>): boolean {
    return this.cache.get(key) === entry;
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
      // Move to the end so the Map's iteration order stays least- to most-recently-used
      this.cache.delete(key);
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
    const results = await this.read(key);
    if (results === undefined) {
      return undefined;
    }
    return Array.isArray(results) ? results.map((result) => result.value) : results.value;
  }

  /**
   * Gets a value or values from the cache, deserializing entries that were stored
   * from non-string values. Plain string entries are returned unchanged.
   */
  async getDeserialized(key: string): Promise<unknown | unknown[] | undefined> {
    const results = await this.read(key);
    if (results === undefined) {
      return undefined;
    }
    return Array.isArray(results)
      ? results.map((result) => this.decodeValue(result))
      : this.decodeValue(results);
  }

  /**
   * Shared implementation of get() and getDeserialized(): reads a single key, or every
   * key matching a wildcard pattern, returning the stored strings with their serialized flag.
   */
  private async read(key: string): Promise<StoredRead | StoredRead[] | undefined> {
    if (!key?.length) {
      this.logger.log('debug', 'Empty key provided to get() method');
      return undefined;
    }

    this.logger.log('info', `Getting cache for key: ${key}`);

    if (!key.includes('*')) {
      return this.readSingle(key);
    }

    const matchingKeys = this.getMatchingKeys(key);
    if (!matchingKeys.length) {
      this.logger.log('debug', `No keys found matching pattern: ${key}`);
      return undefined;
    }

    // For patterns, get all matching values in parallel
    const results = await Promise.all(
      matchingKeys.map(async (matchedKey) => {
        try {
          return await this.readSingle(matchedKey);
        } catch (error) {
          this.logger.log('error', `Error getting cache for key: ${matchedKey}`, error);
          return undefined;
        }
      }),
    );

    // Filter out undefined values from expired or errored keys
    const validResults = results.filter((result): result is StoredRead => result !== undefined);
    return validResults.length > 0 ? validResults : undefined;
  }

  /**
   * Converts a value into its stored string form. Strings are stored as-is;
   * any other value is serialized and flagged so it can be restored on read.
   */
  private encodeValue(value: unknown): { value: string | undefined; serialized: boolean } {
    if (value === undefined || typeof value === 'string') {
      return { value, serialized: false };
    }
    return { value: this.serialization.serialize(value), serialized: true };
  }

  /**
   * Restores a stored value: serialized entries are deserialized, strings are returned unchanged.
   */
  private decodeValue({ value, serialized }: StoredRead): unknown {
    return serialized ? this.serialization.deserialize(value) : value;
  }

  /**
   * Reads a single entry by exact key, returning the (middleware-processed) stored
   * string together with whether it holds a serialized non-string value.
   */
  private async readSingle(key: string): Promise<StoredRead | undefined> {
    const cached = this.cache.get(key);
    const value = await this.getSingle(key);
    if (value === undefined) {
      return undefined;
    }
    return { value, serialized: cached?.serialized === true };
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

      // The timer normally reports the expiry; this covers reads that notice it first
      this.emitExpiry(key, cached);

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
        const context: MiddlewareContext<string | undefined> = {
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
    const context: MiddlewareContext<string | undefined> = {
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

    try {
      this.logger.log('debug', `Refetching key: ${key}`);

      // Execute the source function
      let newValue: string | undefined;
      let serialized: boolean;
      try {
        const encoded = this.encodeValue(await (cached.sourceFn as SourceFn<unknown>)());
        newValue = encoded.value;
        serialized = encoded.serialized;
      } catch (e) {
        this.logger.log('error', `Source function failed during refetch for key: ${key}`, e);

        // Emit event
        this.eventSystem.emitEvent(
          EVENT.REFETCH_FAILURE,
          {
            key,
            value: cached.value,
            ttl: cached.ttl,
            createdAt: cached.createdAt,
            updatedAt: cached.updatedAt,
          },
        );

        // Reset the fetching flag before propagating the error. The entry object is
        // updated in place so a deleted entry is not re-inserted into the cache.
        cached.fetching = false;

        // Rethrow with more context
        throw new Error(`Source function failed for key: '${key}'`);
      }

      // The entry may have been deleted, flushed, invalidated, evicted or replaced
      // by set() while sourceFn was running; writing now would resurrect stale data.
      if (!this.isCurrentEntry(key, cached)) {
        cached.fetching = false;
        this.logger.log('debug', `Discarding refetch result for key: ${key}, entry changed while fetching`);
        return false;
      }

      // Update timestamps before applying middleware
      const now = Date.now();
      const fetchedValue = newValue;

      // Apply middleware
      const context: MiddlewareContext<string | undefined> = {
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
      const storedValue: string = processed;

      // Middleware is async too, so check again before writing
      if (!this.isCurrentEntry(key, cached)) {
        cached.fetching = false;
        this.logger.log('debug', `Discarding refetch result for key: ${key}, entry changed during middleware`);
        return false;
      }

      // Emit event only for results that are actually applied
      this.eventSystem.emitEvent(
        EVENT.REFETCH,
        {
          key,
          value: fetchedValue ?? 'undefined',
          ttl: cached.ttl,
          createdAt: now,
          updatedAt: now,
        },
      );

      // Clear the existing interval if present
      if (cached.interval) {
        cached.interval.clear();
      }

      // Create a new interval if TTL is specified
      let newInterval: ExpiryTimer | undefined;

      if (cached.ttl) {
        newInterval = createExpiryTimer(() => {
          const current = this.cache.get(key);
          if (!current || current.interval !== newInterval) {
            return;
          }
          this.logger.log('debug', `TTL expired for refetched key: ${key}`);
          this.emitExpiry(key, current);

          if (current.autoRefetch) {
            this.logger.log('debug', `Auto-refetching key after expiry: ${key}`);
            this.refetchSingle(key).catch((e) => {
              this.logger.log('error', `Auto-refetch failed for key: ${key}`, e);
            });
          } else {
            // Refetched entries always have a sourceFn, so they are kept for manual
            // refetch; anything derived from the expired value is invalidated
            this.invalidateDependentsOf(key);
          }
        }, cached.ttl);
        newInterval.unref();
      }

      // Update the cache entry
      this.cache.set(key, {
        ...cached,
        value: storedValue,
        serialized,
        updatedAt: now,
        interval: newInterval,
        fetching: false,
        expiryEmitted: false,
      });

      this.logger.log('debug', `Successfully refetched key: ${key}`);

      // Entries derived from the previous value are now stale
      this.invalidateDependentsOf(key);

      return true;
    } catch (e) {
      // If it's not a source function error that we've already handled, reset the fetching flag
      if (!(e instanceof Error && e.message.startsWith(`Source function failed for key: '${key}'`))) {
        this.logger.log('error', `Refetch failed for key: ${key}`, e);

        // Reset the fetching flag in place; never re-insert the entry here
        cached.fetching = false;
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
   * Deletes a single key and invalidates every entry that depends on it.
   * Used for explicit deletes, eviction, expiry and tag invalidation.
   */
  private deleteSingle(key: string): boolean {
    if (!this.removeEntry(key)) {
      return false;
    }
    this.invalidateDependentsOf(key);
    return true;
  }

  /**
   * Removes a single key without touching its dependents
   */
  private removeEntry(key: string): boolean {
    const cache = this.cache.get(key);
    if (!cache) {
      this.logger.log('debug', `Delete failed: key not found: ${key}`);
      return false;
    }

    if (cache.interval) {
      this.logger.log('debug', `Clearing timeout for key: ${key}`);
      cache.interval.clear();
    }

    this.logger.log('info', `Deleted key: ${key}`);
    this.unindexDependencies(key, cache.dependencies);
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
        interval.clear();
      }
    });

    this.cache.clear();
    this.dependents.clear();
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
      this.emitExpiry(key, cached);

      // Clean up expired entry to prevent memory leaks (also invalidates its dependents)
      this.logger.log('debug', `Removing expired key during has() check: ${key}`);
      this.deleteSingle(key);

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
    // Configuring the adapter that is already attached changes nothing: reloading it
    // would restore its last snapshot over entries that have not been saved yet
    if ('storageAdapter' in config && (config.storageAdapter ?? null) !== this.storageAdapter) {
      // If we're replacing the storage adapter, save current data first. If that
      // fails, keep the current adapter so no entries are lost and the caller can retry.
      const previousAdapter = this.storageAdapter;
      if (previousAdapter) {
        if (!(await this.saveToStorage())) {
          this.config.storageAdapter = previousAdapter;
          this.logger.log('error', 'Failed to save cache data before changing storage adapter; keeping the current adapter');
          throw new Error('Failed to save cache data to the current storage adapter; the storage adapter was not changed');
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
   * Checks if a value is a legacy string value (not typed)
   */
  private isLegacyStringValue(value: any): boolean {
    return typeof value === 'string' && !this.hasTypeMetadata(value);
  }

  /**
   * Checks if a serialized string contains type metadata
   */
  private hasTypeMetadata(serialized: string): boolean {
    try {
      const parsed = JSON.parse(serialized);
      return parsed && typeof parsed === 'object' && '__type__' in parsed;
    } catch {
      return false;
    }
  }

  /**
   * Serializes the current cache state for storage
   */
  private serializeCache(): string {
    const entries: { [key: string]: any } = {};
    for (const [key, state] of this.cache.entries()) {
      // Expired entries cannot be served after a restore (source functions are not
      // persisted), so there is no point in writing them out
      if (state.ttl && isExpired(state.updatedAt, state.ttl)) {
        continue;
      }
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
        serialized: state.serialized || undefined,
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

      // The stored `config` block is not applied: the runtime configuration, including
      // options passed in the same configure() call, always takes precedence

      // Restore entries
      if (parsed.entries) {
        for (const [key, entry] of Object.entries(parsed.entries)) {
          const state: CacheState<string> = {
            value: entry.value,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
            ttl: entry.ttl,
            autoRefetch: entry.autoRefetch,
            accessCount: entry.accessCount,
            lastAccessed: entry.lastAccessed,
            tags: entry.tags,
            dependencies: entry.dependencies,
            serialized: entry.serialized === true,
          };

          this.cache.set(key, state);
          this.indexDependencies(key, state.dependencies);
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
  private setExpiryInterval(key: string, state: CacheState<string>): void {
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
    state.interval = createExpiryTimer(() => {
      this.handleExpiry(key, state);
    }, remainingTime);
    state.interval.unref();
  }

  /**
   * Handles expiry of a cache entry
   */
  private handleExpiry(key: string, state: CacheState<string>): void {
    this.logger.log('debug', `TTL expired for key: ${key}`);

    this.emitExpiry(key, state);

    if (typeof state.sourceFn === 'function' && state.autoRefetch) {
      this.logger.log('debug', `Auto-refetching key: ${key}`);
      this.refetchSingle(key).catch((e) => {
        this.logger.log('error', `Auto-refetch failed for key: ${key}`, e);
        /* Ignore as the event is already emitted inside the function */
      });
    } else if (typeof state.sourceFn !== 'function' && this.cache.get(key) === state) {
      this.deleteSingle(key);
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
    const adapter = this.storageAdapter;
    if (!adapter) {
      return false;
    }

    try {
      // Load from storage
      const data = await adapter.load();

      // The adapter may have been replaced or detached while loading
      if (this.storageAdapter !== adapter) {
        this.logger.log('debug', 'Storage adapter changed during load; discarding loaded data');
        return false;
      }

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
      unrefTimer(this.autoSaveInterval);
    }
  }

  /**
   * Adds a middleware function to the middleware chain.
   *
   * @param middleware - The middleware function to add
   * @returns The middleware manager for chaining
   */
  use(middleware: MiddlewareFunction<string | undefined>): MiddlewareManager<string | undefined> {
    return this.middlewareManager.use(middleware);
  }

  /**
   * Clears all middleware functions.
   *
   * @returns The middleware manager for chaining
   */
  clearMiddleware(): MiddlewareManager<string | undefined> {
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

    // Collect every tagged entry first, so each one gets its tag_invalidation event even
    // if it also depends on another tagged entry (otherwise the cascade from that entry
    // could remove it first and report it as a dependency invalidation instead)
    const taggedKeys: string[] = [];
    for (const [key, cacheState] of this.cache.entries()) {
      if (cacheState.tags && cacheState.tags.includes(normalizedTag)) {
        taggedKeys.push(key);
      }
    }

    let invalidated = false;
    for (const key of taggedKeys) {
      const cacheState = this.cache.get(key);
      if (!cacheState) continue;
      this.logger.log('debug', `Invalidating ${key} due to tag match: ${normalizedTag}`);

      // Remove the entry before notifying listeners, so listeners always observe the
      // invalidated state and can never prevent the invalidation from completing.
      // Dependents are invalidated in a second pass below.
      this.removeEntry(key);
      invalidated = true;

      this.eventSystem.emitEvent(
        EVENT.TAG_INVALIDATION,
        {
          key,
          value: cacheState.value,
          ttl: cacheState.ttl,
          createdAt: cacheState.createdAt,
          updatedAt: cacheState.updatedAt,
          tag: normalizedTag,
          _params: { tag: normalizedTag },
        },
      );
    }

    // Then invalidate whatever depended on the removed entries
    for (const key of taggedKeys) {
      this.invalidateDependentsOf(key);
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
    return this.invalidateDependentsOf(key);
  }

  /**
   * Removes every entry that depends on `key`, directly or transitively, emitting a
   * dependency invalidation event for each. `key` itself is left untouched.
   *
   * @param {string} key - The key whose dependents should be invalidated
   * @returns {boolean} - Whether any entries were invalidated
   */
  private invalidateDependentsOf(key: string): boolean {
    // Fast path: no entry declares any dependencies
    if (!this.dependents.size) {
      return false;
    }

    const invalidatedKeys = new Set<string>();
    const queue = [key];

    // Breadth-first walk over the reverse dependency index. The root is never added,
    // so even a cycle that predates cycle detection cannot remove the root entry.
    while (queue.length) {
      const current = queue.shift() as string;
      for (const dependentKey of this.dependents.get(current) ?? []) {
        if (dependentKey === key || invalidatedKeys.has(dependentKey)) continue;
        this.logger.log('debug', `Invalidating ${dependentKey} due to dependency on: ${current}`);
        invalidatedKeys.add(dependentKey);
        queue.push(dependentKey);
      }
    }

    // The full transitive set is known, so remove entries without cascading again
    for (const invalidKey of invalidatedKeys) {
      const cacheState = this.cache.get(invalidKey);
      if (cacheState) {
        // Remove the entry before notifying listeners (see invalidateByTag). The full
        // transitive set is already known, so remove it without cascading again.
        this.removeEntry(invalidKey);

        this.eventSystem.emitEvent(
          EVENT.DEPENDENCY_INVALIDATION,
          {
            key: invalidKey,
            value: cacheState.value,
            ttl: cacheState.ttl,
            createdAt: cacheState.createdAt,
            updatedAt: cacheState.updatedAt,
            dependencyKey: key,
            _params: { dependencyKey: key },
          },
        );
      }
    }

    if (invalidatedKeys.size) {
      this.logger.log('info', `Invalidated ${invalidatedKeys.size} entries dependent on: ${key}`);
    } else {
      this.logger.log('debug', `No entries found dependent on: ${key}`);
    }

    return invalidatedKeys.size > 0;
  }

  /**
   * Returns true if the entry for `fromKey` depends on `targetKey`, directly or through
   * other entries. Used for cycle detection. Expired entries are treated as absent, as
   * they are by get(), has() and isDependencyOf().
   */
  private dependsTransitively(fromKey: string, targetKey: string, visited = new Set<string>()): boolean {
    if (fromKey === targetKey) return true;
    if (visited.has(fromKey)) return false;
    visited.add(fromKey);
    const state = this.cache.get(fromKey);
    if (!state || (state.ttl && isExpired(state.updatedAt, state.ttl))) {
      return false;
    }
    return (state.dependencies ?? []).some((dep) => this.dependsTransitively(dep, targetKey, visited));
  }

  /**
   * Records `key` as a dependent of each of its dependencies in the reverse index
   */
  private indexDependencies(key: string, dependencies: string[] | undefined): void {
    for (const dependency of dependencies ?? []) {
      let set = this.dependents.get(dependency);
      if (!set) {
        set = new Set();
        this.dependents.set(dependency, set);
      }
      set.add(key);
    }
  }

  /**
   * Removes `key` from the reverse index entries of its dependencies
   */
  private unindexDependencies(key: string, dependencies: string[] | undefined): void {
    for (const dependency of dependencies ?? []) {
      const set = this.dependents.get(dependency);
      if (set) {
        set.delete(key);
        if (!set.size) {
          this.dependents.delete(dependency);
        }
      }
    }
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

    // Check that the target key exists and is not expired. This is a read-only query,
    // so it must not update access metadata, emit events or remove entries.
    const cacheState = this.cache.get(targetKey);
    if (!cacheState || (cacheState.ttl && isExpired(cacheState.updatedAt, cacheState.ttl))) {
      this.logger.log('debug', `Target key ${targetKey} does not exist or is expired`);
      return false;
    }

    if (!cacheState.dependencies || cacheState.dependencies.length === 0) {
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
        cacheItem.interval.clear();
        cacheItem.interval = undefined;
      }
    }

    // Clear the cache
    this.cache.clear();
    this.dependents.clear();

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
