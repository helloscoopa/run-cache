import { CacheState } from '../types/cache-state';
import { Logger } from '../logging/logger';

/**
 * Base class for cache eviction policies
 */
export abstract class EvictionPolicyBase {
  protected logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Determines which entries to evict from the cache
   * @param entries Array of key-value pairs from the cache
   * @param count Number of entries to evict
   * @returns Array of keys to be evicted
   */
  abstract getEntriesToEvict(
    _entries: [string, CacheState][],
    _count: number
  ): string[];

  evict(_entries: Map<string, CacheState>, _count: number): string[] {
    return [];
  }
}

/**
 * Least Recently Used (LRU) eviction policy implementation
 * Removes the least recently accessed entries when the cache exceeds its maximum size
 */
export class LRUPolicy extends EvictionPolicyBase {
  getEntriesToEvict(entries: [string, CacheState][], count: number): string[] {
    this.logger.log('debug', `Running LRU eviction for ${count} entries`);

    // Least recently used first. Writes and reads both count as a use, so an entry
    // that was just written is the most recently used one, whether or not it has
    // been read yet. Ties (same millisecond) keep the order of `entries`, which
    // CacheStore keeps in least- to most-recently-used order (Array.prototype.sort is
    // stable). Creation time is deliberately not used: it would override that order.
    const sortedEntries = [...entries].sort(
      ([, stateA], [, stateB]) => stateA.lastAccessed - stateB.lastAccessed,
    );

    // Take the oldest 'count' entries
    const toEvict = sortedEntries.slice(0, count).map(([key]) => key);

    this.logger.log('info', `LRU Eviction: removing ${toEvict.length} entries`, { evictedKeys: toEvict });

    return toEvict;
  }
}

/**
 * Least Frequently Used (LFU) eviction policy implementation
 * Removes the least frequently accessed entries when the cache exceeds its maximum size
 */
export class LFUPolicy extends EvictionPolicyBase {
  getEntriesToEvict(entries: [string, CacheState][], count: number): string[] {
    this.logger.log('debug', `Running LFU eviction for ${count} entries`);

    // Create a sorted array based on LFU criteria
    const sortedEntries = [...entries].sort((a, b) => {
      const [, stateA] = a;
      const [, stateB] = b;

      // First sort by accessCount (lowest first)
      if (stateA.accessCount !== stateB.accessCount) {
        return stateA.accessCount - stateB.accessCount;
      }

      // If accessCount is the same, sort by lastAccessed (oldest first)
      // This ensures entries with the same frequency are evicted based on recency
      return stateA.lastAccessed - stateB.lastAccessed;
    });

    // Take the least frequently accessed 'count' entries
    const toEvict = sortedEntries.slice(0, count).map(([key]) => key);

    this.logger.log('info', `LFU Eviction: removing ${toEvict.length} entries`, { evictedKeys: toEvict });

    return toEvict;
  }
}
