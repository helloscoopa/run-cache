import { StorageAdapter, StorageAdapterConfig } from '../types/storage-adapter';

/**
 * Storage adapter implementation for IndexedDB.
 * This adapter works in browser environments and persists cache data to IndexedDB.
 */
export class IndexedDBAdapter implements StorageAdapter {
  private storageKey: string;

  private dbName: string = 'run-cache-db';

  private storeName: string = 'cache-store';

  private dbVersion: number = 1;

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
   * Verifies that the adapter is running in a supported environment
   * @throws Error if not in a browser environment with IndexedDB support
   */
  private verifyEnvironment(): void {
    if (typeof window === 'undefined' || !window.indexedDB) {
      throw new Error('IndexedDBAdapter can only be used in browser environments with IndexedDB support');
    }
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
    this.verifyEnvironment();

    // Create a new connection promise
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(this.dbName, this.dbVersion);

      // Set a timeout for the connection request
      const timeoutId = setTimeout(() => {
        reject(new Error('IndexedDB connection timed out'));
      }, 5000);

      // Handle upgrade needed (first time or version change)
      request.onupgradeneeded = (_event: IDBVersionChangeEvent) => {
        const db = request.result;

        // Create the object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };

      // Handle blocked (occurs when there are open connections that don't close when a version change is requested)
      request.onblocked = () => {
        clearTimeout(timeoutId);
        reject(new Error('IndexedDB connection blocked. Close all other tabs with this site open'));
      };

      // Handle success
      request.onsuccess = (_event: Event) => {
        clearTimeout(timeoutId);
        this.db = request.result;

        // Listen for close events
        this.db.onclose = () => {
          this.db = null;
          this.dbPromise = null;
        };

        // Listen for version change events
        this.db.onversionchange = () => {
          if (this.db) {
            this.db.close();
            this.db = null;
            this.dbPromise = null;
          }
        };

        resolve(this.db);
      };

      // Handle error
      request.onerror = () => {
        clearTimeout(timeoutId);
        const errorMsg = request.error?.message || 'unknown error';
        const message = `Failed to open IndexedDB: ${errorMsg}`;
        reject(new Error(message));
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
        request.onerror = () => {
          const errorMsg = request.error?.message || 'unknown error';
          const message = `Failed to save to IndexedDB: ${errorMsg}`;
          reject(new Error(message));
        };

        // Handle transaction errors
        transaction.onerror = () => {
          const errorMsg = transaction.error?.message || 'unknown error';
          const message = `Transaction failed: ${errorMsg}`;
          reject(new Error(message));
        };

        // Handle transaction aborts
        transaction.onabort = () => {
          const errorMsg = transaction.error?.message || 'unknown error';
          const message = `Transaction aborted: ${errorMsg}`;
          reject(new Error(message));
        };
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

        // Handle transaction errors
        transaction.onerror = () => {
          reject(new Error(`Transaction failed: ${transaction.error?.message || 'unknown error'}`));
        };

        // Handle transaction aborts
        transaction.onabort = () => {
          reject(new Error(`Transaction aborted: ${transaction.error?.message || 'unknown error'}`));
        };
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

        // Handle transaction errors
        transaction.onerror = () => {
          reject(new Error(`Transaction failed: ${transaction.error?.message || 'unknown error'}`));
        };

        // Handle transaction aborts
        transaction.onabort = () => {
          reject(new Error(`Transaction aborted: ${transaction.error?.message || 'unknown error'}`));
        };
      });
    } catch (error) {
      throw new Error(`Failed to clear cache data from IndexedDB: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  /**
   * Close the database connection and clean up resources
   * This should be called when the adapter is no longer needed
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.dbPromise = null;
    }
  }

  private handleUpgradeNeeded(_event: IDBVersionChangeEvent): void {
    // Implementation needed
  }

  private handleSuccess(_event: Event): void {
    // Implementation needed
  }

  private handleError(_event: Event): void {
    // Implementation needed
  }
}
