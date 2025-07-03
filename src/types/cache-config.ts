import { StorageAdapter } from './storage-adapter';
import { TypeValidator } from '../core/type-validation';
import { SerializationAdapter } from '../core/serialization';

/**
 * Eviction policy for the cache
 */
export enum EvictionPolicy {
  /** No eviction policy - cache will grow indefinitely */
  NONE = 'NONE',
  /** Least Recently Used - evict least recently used entries first */
  LRU = 'LRU',
  /** Least Frequently Used - evict least frequently used entries first */
  LFU = 'LFU',
}

/**
 * Configuration options for the cache
 */
export interface CacheConfig {
  /**
   * Maximum number of entries to store in the cache
   * @default Infinity
   */
  maxEntries?: number;

  /**
   * Default time-to-live in milliseconds for cache entries
   * @default Infinity
   */
  defaultTTL?: number;

  /**
   * Eviction policy to use when cache is full
   * @default EvictionPolicy.NONE
   */
  evictionPolicy?: EvictionPolicy;

  /**
   * Storage adapter for persistence
   * @default null (no persistence)
   */
  storageAdapter?: StorageAdapter;

  /**
   * Whether to enable debug logging
   * @default false
   */
  debug?: boolean;
}

/**
 * Type-safe configuration options for typed cache instances
 */
export interface TypedCacheConfig<T> extends CacheConfig {
  /**
   * Type validator for runtime type checking
   * @default undefined (no validation)
   */
  typeValidator?: TypeValidator<T>;

  /**
   * Custom serialization adapter for the specific type T
   * @default undefined (use default serialization)
   */
  serializationAdapter?: SerializationAdapter<T>;

  /**
   * Whether to enforce strict type checking at runtime
   * When true, all values must pass the typeValidator check
   * @default false
   */
  enforceTypeChecking?: boolean;

  /**
   * Whether to validate values on get operations
   * When true, retrieved values are validated before being returned
   * @default false
   */
  validateOnGet?: boolean;

  /**
   * Whether to validate values on set operations
   * When true, values are validated before being stored
   * @default true (if typeValidator is provided)
   */
  validateOnSet?: boolean;

  /**
   * Action to take when type validation fails
   * - 'throw': Throw a TypeValidationError
   * - 'warn': Log a warning and continue
   * - 'ignore': Silently ignore validation failures
   * @default 'throw'
   */
  validationFailureAction?: 'throw' | 'warn' | 'ignore';
}
