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
import { EvictionPolicy, EVENT } from './run-cache';
import type { RunCacheConfig } from './types/cache-config';
import type { EventParam, EventName } from './types/events';
import type { MiddlewareFunction, MiddlewareContext } from './types/middleware';
import type { StorageAdapter, StorageAdapterConfig } from './types/storage-adapter';

// Re-export the core cache implementation
export default RunCache;
export { RunCache };

// Re-export the eviction policy enum and event constants
export { EvictionPolicy, EVENT };

// Re-export storage adapters
export * from './storage';

// Re-export types for TypeScript users
export type {
  RunCacheConfig,
  EventParam,
  EventName,
  MiddlewareFunction,
  MiddlewareContext,
  StorageAdapter,
  StorageAdapterConfig
}; 