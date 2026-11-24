/**
 * Interface for persistent storage adapters.
 * Implementations should handle saving and loading cache data from various storage mechanisms.
 */
export interface StorageAdapter {
  /**
   * Store cache data to persistent storage
   * @param _data The serialized cache data to store
   * @returns Promise that resolves when the data is successfully stored
   */
  save(_data: string): Promise<void>;

  /**
   * Load cache data from persistent storage
   * @returns Promise that resolves with the serialized cache data, or null if no data exists
   */
  load(): Promise<string | null>;

  /**
   * Clear all stored cache data
   * @returns Promise that resolves when the data is successfully cleared
   */
  clear(): Promise<void>;

  /**
   * Optional auto-save interval in milliseconds. When set to a positive value, the cache
   * saves to this adapter at that interval once the adapter is attached.
   * The built-in adapters take it from their `autoSaveInterval` option.
   */
  readonly autoSaveInterval?: number;

  /**
   * Whether the cache loads existing data from this adapter when the adapter is attached.
   * Treated as `true` when not set. The built-in adapters take it from their `autoLoadOnInit` option.
   */
  readonly autoLoadOnInit?: boolean;
}

/**
 * Configuration options for storage adapters
 */
export interface StorageAdapterConfig {
  /**
   * Storage key to use for the cache data
   * @default "run-cache-data"
   */
  storageKey?: string;

  /**
   * Auto-save interval in milliseconds. If provided, cache will automatically
   * save at this interval. Set to 0 to disable auto-saving.
   * @default 0 (disabled)
   */
  autoSaveInterval?: number;

  /**
   * Whether to load cache data automatically when the adapter is initialized
   * @default true
   */
  autoLoadOnInit?: boolean;
}
