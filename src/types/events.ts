/**
 * @file Defines TypeScript types for the event system in RunCache.
 * These types support the pub/sub event system that allows monitoring cache operations.
 */

/**
 * Enumeration of all event types supported by the cache system
 */
export const EVENT = {
  /** Emitted when a cache entry expires */
  EXPIRE: 'expire',

  /** Emitted when a cache entry is refetched */
  REFETCH: 'refetch',

  /** Emitted when a refetch operation fails */
  REFETCH_FAILURE: 'refetch_failure',

  /** Emitted when a tag is invalidated */
  TAG_INVALIDATION: 'tag_invalidation',

  /** Emitted when a dependency is invalidated */
  DEPENDENCY_INVALIDATION: 'dependency_invalidation',
} as const;

// Support both enum keys (EXPIRE) and enum values ("expire")
export type EventName = keyof typeof EVENT
  | 'expire'
  | 'refetch'
  | 'refetch_failure'
  | 'tag_invalidation'
  | 'dependency_invalidation';

/**
 * Event parameter type shared across all event handlers
 *
 * @template T The type of the cached value
 */
export type EventParam<T = string> = {
  /**
   * The cache key associated with the event
   */
  key: string;

  /**
   * The cached value
   */
  value: T;

  /**
   * Serialized value for compatibility with event handlers
   */
  serializedValue?: string;

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
 * Event parameters passed to event handlers
 */
export interface EmitParam {
  /** The cache key that triggered the event */
  key: string;
  /** The value associated with the key */
  value: string;
  /** When the cache entry was created */
  createdAt: number;
  /** When the cache entry was last updated */
  updatedAt: number;
  /** Time-to-live in milliseconds, if applicable */
  ttl?: number;
  /** The tag that triggered the invalidation (only for TAG_INVALIDATION events) */
  tag?: string;
  /** The dependency key that triggered the invalidation (only for DEPENDENCY_INVALIDATION events) */
  dependencyKey?: string;
  /** Additional parameters specific to the event */
  _params?: Record<string, any>;
}

/**
 * Event callback function type.
 * This defines the signature of functions that can be registered as event handlers.
 *
 * @template T The type of the cached value
 * @param {EventParam<T>} params - The event parameters containing cache entry data
 * @returns {Promise<void> | void} May return a Promise for async handlers or void for sync handlers
 */
export type EventFn<T = string> = (_params: EventParam<T>) => Promise<void> | void;

export type EventParams = {
  _params: Record<string, any>;
  // ... existing code ...
};
