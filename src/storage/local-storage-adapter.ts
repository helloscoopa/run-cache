import { StorageAdapter, StorageAdapterConfig } from '../types/storage-adapter';

/**
 * Storage adapter implementation for localStorage.
 * This adapter works in browser environments and persists cache data to localStorage.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private storageKey: string;

  /**
   * Creates a new LocalStorageAdapter instance
   * @param config Configuration options
   */
  constructor(config?: Partial<StorageAdapterConfig>) {
    this.storageKey = config?.storageKey || 'run-cache-data';
  }

  /**
   * Verifies that the adapter is running in a supported environment
   * @throws Error if not in a browser environment with localStorage
   */
  private verifyEnvironment(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('LocalStorageAdapter can only be used in browser environments with localStorage support');
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
      throw new Error(`Failed to save cache data to localStorage: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  /**
   * Load cache data from localStorage
   * @returns The serialized cache data, or null if no data exists
   */
  async load(): Promise<string | null> {
    this.verifyEnvironment();
    
    return window.localStorage.getItem(this.storageKey);
  }

  /**
   * Clear stored cache data from localStorage
   */
  async clear(): Promise<void> {
    this.verifyEnvironment();
    
    window.localStorage.removeItem(this.storageKey);
  }
} 