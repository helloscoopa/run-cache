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
   * Store cache data to localStorage
   * @param data The serialized cache data to store
   */
  async save(data: string): Promise<void> {
    // Check if we're in a browser environment with localStorage
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('LocalStorageAdapter can only be used in browser environments with localStorage support');
    }

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
    // Check if we're in a browser environment with localStorage
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('LocalStorageAdapter can only be used in browser environments with localStorage support');
    }
    
    return window.localStorage.getItem(this.storageKey);
  }

  /**
   * Clear stored cache data from localStorage
   */
  async clear(): Promise<void> {
    // Check if we're in a browser environment with localStorage
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('LocalStorageAdapter can only be used in browser environments with localStorage support');
    }
    
    window.localStorage.removeItem(this.storageKey);
  }
} 