/**
 * @file Main entry point for RunCache - A lightweight, dependency-free runtime caching library.
 * 
 * This file exports the RunCache class and its associated types.
 * Import RunCache from this module to use the caching functionality.
 * 
 * @example
 * import { RunCache, EvictionPolicy } from 'run-cache';
 * 
 * // Configure the cache
 * RunCache.configure({ maxSize: 1000, evictionPolicy: EvictionPolicy.LRU });
 * 
 * // Set a cache entry
 * await RunCache.set({ key: 'user:123', value: 'John Doe', ttl: 60000 });
 * 
 * // Get a cache entry
 * const user = await RunCache.get('user:123');
 */

import { RunCache } from './run-cache';
import { EvictionPolicy } from './types/cache-config';
import { EVENT, EventParam } from './types/events';

export { RunCache, EvictionPolicy, EVENT, EventParam }; 