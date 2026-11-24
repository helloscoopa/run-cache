import { StorageAdapter, StorageAdapterConfig } from '../types/storage-adapter';

/**
 * Storage adapter implementation for localStorage.
 * This adapter works in browser environments and persists cache data to localStorage.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private storageKey: string;

  /** Auto-save interval in milliseconds, from the `autoSaveInterval` option (0 disables) */
  readonly autoSaveInterval: number;

  /** Whether existing data is loaded when the adapter is attached, from the `autoLoadOnInit` option */
  readonly autoLoadOnInit: boolean;

  /**
   * Creates a new LocalStorageAdapter instance
   * @param config Configuration options
   */
  constructor(config?: Partial<StorageAdapterConfig>) {
    this.storageKey = config?.storageKey || 'run-cache-data';
    this.autoSaveInterval = config?.autoSaveInterval ?? 0;
    this.autoLoadOnInit = config?.autoLoadOnInit ?? true;
    this.verifyEnvironment();
  }

  /**
   * Verifies that the adapter is running in a supported environment
   * @throws Error if not in a browser environment with localStorage
   */
  private verifyEnvironment(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error(
        'LocalStorageAdapter can only be used in browser environments with localStorage support',
      );
    }
  }

  /**
   * Store cache data to localStorage
   * @param data The serialized cache data to store
   */
  async save(data: string): Promise<void> {
    this.verifyEnvironment();

    try {
      window.localStorage.setItem(this.storageKey, data);
    } catch (error) {
      // Handle localStorage errors (e.g., quota exceeded)
      throw new Error(
        `Failed to save cache data to localStorage: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /**
   * Load cache data from localStorage
   * @returns The serialized cache data, or null if no data exists
   */
  async load(): Promise<string | null> {
    this.verifyEnvironment();
    try {
      return window.localStorage.getItem(this.storageKey);
    } catch (error) {
      throw new Error(
        `Failed to load cache data from localStorage: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /**
   * Clear stored cache data from localStorage
   */
  async clear(): Promise<void> {
    this.verifyEnvironment();
    try {
      window.localStorage.removeItem(this.storageKey);
    } catch (error) {
      throw new Error(
        `Failed to clear cache data from localStorage: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
