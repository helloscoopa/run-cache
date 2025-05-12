/**
 * @file Defines TypeScript types for the event system in RunCache.
 * These types support the pub/sub event system that allows monitoring cache operations.
 */

/**
 * Event parameter object with cache entry data.
 * This is passed to event callbacks when cache events occur.
 * 
 * @property {string} key - The key of the cache entry that triggered the event
 * @property {string} value - The value stored in the cache entry
 * @property {number} [ttl] - Time to live in milliseconds (if configured)
 * @property {number} createdAt - Timestamp when the entry was first created
 * @property {number} updatedAt - Timestamp when the entry was last updated
 */
export type EventParam = {
  key: string;
  value: string;
  ttl?: number;
  createdAt: number;
  updatedAt: number;
};

/**
 * Parameter for emitting events.
 * This is used internally when triggering events.
 */
export type EmitParam = EventParam;

/**
 * Event callback function type.
 * This defines the signature of functions that can be registered as event handlers.
 * 
 * @param {EventParam} params - The event parameters containing cache entry data
 * @returns {Promise<void> | void} May return a Promise for async handlers or void for sync handlers
 */
export type EventFn = (params: EventParam) => Promise<void> | void;

/**
 * Event types constants.
 * This defines all possible event types in the cache system.
 * 
 * @property {string} EXPIRE - Triggered when a cache entry expires (TTL is reached)
 * @property {string} REFETCH - Triggered when a cache entry is automatically refetched
 * @property {string} REFETCH_FAILURE - Triggered when an automatic refetch operation fails
 */
export const EVENT = Object.freeze({
  EXPIRE: "expire",
  REFETCH: "refetch",
  REFETCH_FAILURE: "refetch_failure",
});

/**
 * Union type of all possible event names.
 * This type represents any valid event name in the cache system.
 */
export type EventName = (typeof EVENT)[keyof typeof EVENT]; 