import { StorageAdapter, StorageAdapterConfig } from '../types/storage-adapter';

/**
 * Storage adapter implementation for IndexedDB.
 * This adapter works in browser environments and persists cache data to IndexedDB.
 */
export class IndexedDBAdapter implements StorageAdapter {
  private storageKey: string;
  private dbName: string = 'run-cache-db';
  private storeName: string = 'cache-store';
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Creates a new IndexedDBAdapter instance
   * @param config Configuration options
   */
  constructor(config?: Partial<StorageAdapterConfig>) {
    this.storageKey = config?.storageKey || 'run-cache-data';
    
    // Initialize the database connection
    this.initDB();
  }

  /**
   * Initialize the IndexedDB database
   */
  private initDB(): Promise<IDBDatabase> {
    // If we already have a connection or an in-progress connection, use it
    if (this.db) {
      return Promise.resolve(this.db);
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    // Check if we're in a browser environment with IndexedDB
    if (typeof window === 'undefined' || !window.indexedDB) {
      return Promise.reject(new Error('IndexedDBAdapter can only be used in browser environments with IndexedDB support'));
    }

    // Create a new connection promise
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(this.dbName, 1);

      // Handle upgrade needed (first time or version change)
      request.onupgradeneeded = (event) => {
        const db = request.result;
        
        // Create the object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };

      // Handle success
      request.onsuccess = (event) => {
        this.db = request.result;
        resolve(this.db);
      };

      // Handle error
      request.onerror = (event) => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message || 'unknown error'}`));
      };
    });

    return this.dbPromise;
  }

  /**
   * Store cache data to IndexedDB
   * @param data The serialized cache data to store
   */
  async save(data: string): Promise<void> {
    try {
      const db = await this.initDB();
      
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        
        // Store the data with the storage key as the ID
        const request = store.put({ id: this.storageKey, data });
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error(`Failed to save to IndexedDB: ${request.error?.message || 'unknown error'}`));
      });
    } catch (error) {
      throw new Error(`Failed to save cache data to IndexedDB: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  /**
   * Load cache data from IndexedDB
   * @returns The serialized cache data, or null if no data exists
   */
  async load(): Promise<string | null> {
    try {
      const db = await this.initDB();
      
      return new Promise<string | null>((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        
        // Get the data with the storage key
        const request = store.get(this.storageKey);
        
        request.onsuccess = () => {
          // If the data exists, return it, otherwise return null
          if (request.result) {
            resolve(request.result.data);
          } else {
            resolve(null);
          }
        };
        
        request.onerror = () => reject(new Error(`Failed to load from IndexedDB: ${request.error?.message || 'unknown error'}`));
      });
    } catch (error) {
      throw new Error(`Failed to load cache data from IndexedDB: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  /**
   * Clear stored cache data from IndexedDB
   */
  async clear(): Promise<void> {
    try {
      const db = await this.initDB();
      
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        
        // Delete the data with the storage key
        const request = store.delete(this.storageKey);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error(`Failed to clear from IndexedDB: ${request.error?.message || 'unknown error'}`));
      });
    } catch (error) {
      throw new Error(`Failed to clear cache data from IndexedDB: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
} 