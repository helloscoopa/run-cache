import { Logger } from '../logging/logger';
import { MiddlewareContext, MiddlewareFunction, MiddlewareManager } from '../types/middleware';

/**
 * Implements the middleware pattern for RunCache operations.
 * Manages a chain of middleware functions that can transform cache values.
 */
export class DefaultMiddlewareManager implements MiddlewareManager {
  private middlewares: MiddlewareFunction[] = [];
  private logger: Logger;

  /**
   * Creates a new middleware manager.
   * 
   * @param logger - The logger to use for debugging
   */
  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Adds a middleware function to the chain.
   * Middleware functions are executed in the order they are added.
   * 
   * @param middleware - The middleware function to add
   * @returns The middleware manager (for chaining)
   */
  use(middleware: MiddlewareFunction): MiddlewareManager {
    this.middlewares.push(middleware);
    this.logger.log('debug', `Added middleware function to chain, current length: ${this.middlewares.length}`);
    return this;
  }

  /**
   * Clears all middleware functions.
   * 
   * @returns The middleware manager (for chaining)
   */
  clear(): MiddlewareManager {
    this.middlewares = [];
    this.logger.log('debug', 'Cleared all middleware functions');
    return this;
  }

  /**
   * Executes the middleware chain for a given operation.
   * 
   * @param value - The initial value
   * @param context - Context information about the operation
   * @returns The final processed value after all middleware execution
   */
  async execute(value: string | undefined, context: MiddlewareContext): Promise<string | undefined> {
    this.logger.log('debug', `Executing middleware chain for operation: ${context.operation}, key: ${context.key}`);
    
    if (this.middlewares.length === 0) {
      this.logger.log('debug', 'No middleware to execute, returning original value');
      return value;
    }

    // Create a copy of the middlewares array to avoid issues if middleware is added during execution
    const middlewares = [...this.middlewares];
    
    try {
      // Simple sequential execution
      let currentVal = value;
      let index = 0;
      
      // Create a next function that processes the next middleware
      const next = async (val: string | undefined): Promise<string | undefined> => {
        index++;
        if (index >= middlewares.length) {
          // We're at the end of the chain
          return val;
        }
        // Call the next middleware in the chain
        return await middlewares[index](val, context, next);
      };
      
      // Start with the first middleware
      const result = await middlewares[0](currentVal, context, next);
      
      this.logger.log('debug', `Middleware chain execution completed for key: ${context.key}`);
      return result;
    } catch (error) {
      this.logger.log('error', `Middleware chain execution failed for key: ${context.key}`, error);
      throw error;
    }
  }
} 