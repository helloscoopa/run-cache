/**
 * @file Defines TypeScript types for the event system in RunCache.
 * These types support the pub/sub event system that allows monitoring cache operations.
 */

/**
 * Enumeration of all event types supported by the cache system
 */
export enum EVENT {
  /**
   * Fired when a cache entry expires due to TTL
   */
  EXPIRE = "expire",
  
  /**
   * Fired when a cache entry is refreshed via its source function
   */
  REFETCH = "refetch",
  
  /**
   * Fired when a cache entry's refetch operation fails
   */
  REFETCH_FAILURE = "refetch_failure",

  /**
   * Fired when one or more cache entries are invalidated due to a tag
   */
  TAG_INVALIDATION = "tag_invalidation",

  /**
   * Fired when one or more cache entries are invalidated due to a dependency
   */
  DEPENDENCY_INVALIDATION = "dependency_invalidation"
}

// Support both enum keys (EXPIRE) and enum values ("expire")
export type EventName = keyof typeof EVENT | "expire" | "refetch" | "refetch_failure" | "tag_invalidation" | "dependency_invalidation";

/**
 * Event parameter type shared across all event handlers
 */
export type EventParam = {
  /**
   * The cache key associated with the event
   */
  key: string;
  
  /**
   * The cached value
   */
  value: string;
  
  /**
   * Time-to-live in milliseconds, if applicable
   */
  ttl?: number;
  
  /**
   * Timestamp when the entry was created
   */
  createdAt: number;
  
  /**
   * Timestamp when the entry was last updated
   */
  updatedAt: number;

  /**
   * The tag that triggered the invalidation (only for TAG_INVALIDATION events)
   */
  tag?: string;

  /**
   * The dependency key that triggered the invalidation (only for DEPENDENCY_INVALIDATION events)
   */
  dependencyKey?: string;
};

/**
 * Parameter for emitting events
 */
export type EmitParam = {
  /**
   * The cache key associated with the event
   */
  key: string;
  
  /**
   * The cached value
   */
  value: string;
  
  /**
   * Time-to-live in milliseconds, if applicable
   */
  ttl?: number;
  
  /**
   * Timestamp when the entry was created
   */
  createdAt: number;
  
  /**
   * Timestamp when the entry was last updated
   */
  updatedAt: number;

  /**
   * The tag that triggered the invalidation (only for TAG_INVALIDATION events)
   */
  tag?: string;

  /**
   * The dependency key that triggered the invalidation (only for DEPENDENCY_INVALIDATION events)
   */
  dependencyKey?: string;
};

/**
 * Event callback function type.
 * This defines the signature of functions that can be registered as event handlers.
 * 
 * @param {EventParam} params - The event parameters containing cache entry data
 * @returns {Promise<void> | void} May return a Promise for async handlers or void for sync handlers
 */
export type EventFn = (params: EventParam) => Promise<void> | void; 