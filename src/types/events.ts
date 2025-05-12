/**
 * Event parameter object with cache entry data
 */
export type EventParam = {
  key: string;
  value: string;
  ttl?: number;
  createdAt: number;
  updatedAt: number;
};

/**
 * Parameter for emitting events
 */
export type EmitParam = Pick<EventParam, "value" | "ttl" | "createdAt" | "updatedAt"> & {
  key: string;
};

/**
 * Event callback function type
 */
export type EventFn = (params: EventParam) => Promise<void> | void;

/**
 * Event types constants
 */
export const EVENT = Object.freeze({
  EXPIRE: "expire",
  REFETCH: "refetch",
  REFETCH_FAILURE: "refetch-failure",
});

/**
 * Union type of all possible event names
 */
export type EventName = (typeof EVENT)[keyof typeof EVENT]; 