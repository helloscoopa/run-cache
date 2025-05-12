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
 * Middleware function type.
 * Each middleware can transform the value or pass it through.
 * Middleware can be synchronous or asynchronous.
 * 
 * @param value - The current value being processed
 * @param context - Context information about the operation
 * @param next - Function to call the next middleware in the chain
 * @returns The processed value (possibly transformed)
 */
export type MiddlewareFunction = (
  value: string | undefined,
  context: MiddlewareContext,
  next: (value: string | undefined) => Promise<string | undefined>
) => Promise<string | undefined>;

/**
 * Interface for registering and managing middleware.
 */
export interface MiddlewareManager {
  /**
   * Adds a middleware function to the chain.
   * Middleware functions are executed in the order they are added.
   * 
   * @param middleware - The middleware function to add
   * @returns The middleware manager (for chaining)
   */
  use(middleware: MiddlewareFunction): MiddlewareManager;

  /**
   * Clears all middleware functions.
   * 
   * @returns The middleware manager (for chaining)
   */
  clear(): MiddlewareManager;

  /**
   * Executes the middleware chain for a given operation.
   * 
   * @param value - The initial value
   * @param context - Context information about the operation
   * @returns The final processed value after all middleware execution
   */
  execute(value: string | undefined, context: MiddlewareContext): Promise<string | undefined>;
} 