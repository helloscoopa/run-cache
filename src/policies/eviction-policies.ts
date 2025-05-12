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
    entries: [string, CacheState][],
    count: number
  ): string[];
}

/**
 * Least Recently Used (LRU) eviction policy implementation
 * Removes the least recently accessed entries when the cache exceeds its maximum size
 */
export class LRUPolicy extends EvictionPolicyBase {
  getEntriesToEvict(entries: [string, CacheState][], count: number): string[] {
    this.logger.log('debug', `Running LRU eviction for ${count} entries`);
    
    // Create a sorted array based on LRU criteria
    const sortedEntries = [...entries].sort((a, b) => {
      const [, stateA] = a;
      const [, stateB] = b;
      
      // First sort by access count - items that were never accessed get evicted first
      if (stateA.accessCount === 0 && stateB.accessCount > 0) {
        return -1; // A comes first (should be evicted)
      }
      if (stateA.accessCount > 0 && stateB.accessCount === 0) {
        return 1; // B comes first (should be evicted)
      }
      
      // If both items have the same access counts, sort by last accessed time
      if (stateA.lastAccessed === stateB.lastAccessed) {
        // Sort by creation time if last accessed times are identical
        return stateA.createdAt - stateB.createdAt;
      }
      
      // Otherwise just sort by lastAccessed time (oldest first)
      return stateA.lastAccessed - stateB.lastAccessed;
    });
    
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
      
      // If accessCount is the same, sort by createdAt (oldest first)
      // This ensures deterministic behavior when entries have the same frequency
      return stateA.createdAt - stateB.createdAt;
    });
    
    // Take the least frequently accessed 'count' entries
    const toEvict = sortedEntries.slice(0, count).map(([key]) => key);
    
    this.logger.log('info', `LFU Eviction: removing ${toEvict.length} entries`, { evictedKeys: toEvict });
    
    return toEvict;
  }
} 