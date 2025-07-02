/**
 * @file Defines TypeScript types for middleware functionality.
 */

/**
 * Context object passed to middleware functions.
 * Contains information about the current operation and cache entry.
 *
 * @template T The type of the cached value
 */
export interface MiddlewareContext<T = string> {
  /** The cache key being operated on */
  key: string;
  /** The operation being performed */
  operation: 'get' | 'set' | 'delete' | 'has' | 'refetch';
  /** The original value (if applicable) */
  value?: T;
  /** Serialized value for compatibility */
  serializedValue?: string;
  /** Time-to-live in milliseconds (if applicable) */
  ttl?: number;
  /** Whether auto-refetch is enabled (if applicable) */
  autoRefetch?: boolean;
  /** Timestamp when the operation was initiated */
  timestamp: number;
}

/**
 * Base middleware function type.
 * Each middleware can transform the value or pass it through.
 * Middleware can be synchronous or asynchronous.
 *
 * @template T The type of the cached value
 */
export type MiddlewareFunction<T = string> = (
  _value: T,
  _context: MiddlewareContext<T>,
  _next: (_nextValue: T) => Promise<T>
) => Promise<T>;

/**
 * Interface for registering and managing middleware.
 *
 * @template T The type of the cached value
 */
export interface MiddlewareManager<T = string> {
  /**
   * Adds a middleware function to the chain.
   * Middleware functions are executed in the order they are added.
   *
   * @param _middleware - The middleware function to add
   * @returns The middleware manager (for chaining)
   */
  use(_middleware: MiddlewareFunction<T>): MiddlewareManager<T>;

  /**
   * Clears all middleware functions.
   *
   * @returns The middleware manager (for chaining)
   */
  clear(): MiddlewareManager<T>;

  /**
   * Executes the middleware chain for a given operation.
   *
   * @param _value - The initial value
   * @param _context - Context information about the operation
   * @returns The final processed value after all middleware execution
   */
  execute(_value: T, _context: MiddlewareContext<T>): Promise<T>;
}

export type BeforeMiddleware<T = any> = (_value: T, _context: MiddlewareContext<T>) => Promise<void>;
export type AfterMiddleware<T = any> = (_value: T, _context: MiddlewareContext<T>) => Promise<void>;
export type ErrorMiddleware<T = any> = (
  _error: Error,
  _value: T,
  _context: MiddlewareContext<T>,
  _next: () => Promise<void>
) => Promise<void>;

export type MiddlewareConfig = {
  middleware: MiddlewareFunction[];
};
