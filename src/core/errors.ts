/**
 * Base class for errors thrown by RunCache for a specific cache key.
 * `cause` holds the original error, when there is one.
 */
export class RunCacheError extends Error {
  /** The cache key the failing operation was for */
  readonly key: string;

  /** The underlying error (for example, the one thrown by a source function) */
  readonly cause?: unknown;

  constructor(message: string, key: string, cause?: unknown) {
    super(message);
    // Set explicitly rather than read from the class, so the name survives minification
    this.name = 'RunCacheError';
    this.key = key;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/**
 * Thrown when a source function throws, rejects or resolves to `undefined`.
 */
export class SourceFnError extends RunCacheError {
  constructor(message: string, key: string, cause?: unknown) {
    super(message, key, cause);
    this.name = 'SourceFnError';
  }
}

/**
 * Thrown when a middleware function throws or produces `undefined`.
 */
export class MiddlewareError extends RunCacheError {
  constructor(message: string, key: string, cause?: unknown) {
    super(message, key, cause);
    this.name = 'MiddlewareError';
  }
}
