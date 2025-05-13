/**
 * @file Defines TypeScript types for middleware functionality.
 */

/**
 * Context object passed to middleware functions.
 * Contains information about the current operation and cache entry.
 */
export interface MiddlewareContext {
  /** The cache key being operated on */
  key: string;
  /** The operation being performed */
  operation: 'get' | 'set' | 'delete' | 'has' | 'refetch';
  /** The original value (if applicable) */
  value?: string;
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
 */
export type MiddlewareFunction<T = string | undefined> = (
  _value: T,
  _context: MiddlewareContext,
  _next: (_nextValue: T) => Promise<T>
) => Promise<T>;

/**
 * Interface for registering and managing middleware.
 */
export interface MiddlewareManager {
  /**
   * Adds a middleware function to the chain.
   * Middleware functions are executed in the order they are added.
   *
   * @param _middleware - The middleware function to add
   * @returns The middleware manager (for chaining)
   */
  use(_middleware: MiddlewareFunction): MiddlewareManager;

  /**
   * Clears all middleware functions.
   *
   * @returns The middleware manager (for chaining)
   */
  clear(): MiddlewareManager;

  /**
   * Executes the middleware chain for a given operation.
   *
   * @param _value - The initial value
   * @param _context - Context information about the operation
   * @returns The final processed value after all middleware execution
   */
  execute(_value: string | undefined, _context: MiddlewareContext): Promise<string | undefined>;
}

export type BeforeMiddleware<T = any> = (_value: T, _context: MiddlewareContext) => Promise<void>;
export type AfterMiddleware<T = any> = (_value: T, _context: MiddlewareContext) => Promise<void>;
export type ErrorMiddleware<T = any> = (
  _error: Error,
  _value: T,
  _context: MiddlewareContext,
  _next: () => Promise<void>
) => Promise<void>;

export type MiddlewareConfig = {
  middleware: MiddlewareFunction[];
};
