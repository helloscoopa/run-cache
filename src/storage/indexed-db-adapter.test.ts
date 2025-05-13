import { IndexedDBAdapter } from './indexed-db-adapter';

describe('IndexedDBAdapter', () => {
  let adapter: IndexedDBAdapter;
  const mockIDBRequest = {
    result: null as any,
    error: null as any,
    onupgradeneeded: null as ((event: Event) => void) | null,
    onsuccess: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onblocked: null as ((event: Event) => void) | null,
  };

  const mockIDBObjectStore = {
    put: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  };

  const mockIDBTransaction = {
    objectStore: jest.fn().mockReturnValue(mockIDBObjectStore),
    onerror: null as ((event: Event) => void) | null,
    onabort: null as ((event: Event) => void) | null,
  };

  const mockIDBDatabase = {
    createObjectStore: jest.fn(),
    transaction: jest.fn().mockReturnValue(mockIDBTransaction),
    objectStoreNames: { contains: jest.fn() },
    close: jest.fn(),
    onclose: null as ((event: Event) => void) | null,
    onversionchange: null as ((event: Event) => void) | null,
  };

  const mockIndexedDB = {
    open: jest.fn().mockReturnValue(mockIDBRequest),
  };

  beforeEach(() => {
    // Setup mock IndexedDB
    Object.defineProperty(window, 'indexedDB', {
      value: mockIndexedDB,
      writable: true,
    });

    // Reset all mocks
    jest.clearAllMocks();
    mockIDBRequest.result = mockIDBDatabase;
    mockIDBRequest.error = null;

    // Create a new adapter instance
    adapter = new IndexedDBAdapter();

    // Immediately trigger success for the initial database connection
    setTimeout(() => {
      mockIDBRequest.onsuccess?.(new Event('success'));
    }, 0);
  });

  describe('constructor', () => {
    it('should use default storage key if not provided', () => {
      expect(adapter['storageKey']).toBe('run-cache-data');
    });

    it('should use custom storage key if provided', () => {
      const customAdapter = new IndexedDBAdapter({ storageKey: 'custom-key' });
      expect(customAdapter['storageKey']).toBe('custom-key');
    });
  });

  describe('verifyEnvironment', () => {
    it('should throw error if IndexedDB is not available', () => {
      Object.defineProperty(window, 'indexedDB', {
        value: undefined,
        writable: true,
      });

      expect(() => adapter['verifyEnvironment']()).toThrow(
        'IndexedDBAdapter can only be used in browser environments with IndexedDB support'
      );
    });

    it('should not throw error if IndexedDB is available', () => {
      expect(() => adapter['verifyEnvironment']()).not.toThrow();
    });
  });

  describe('initDB', () => {
    it('should initialize database successfully', async () => {
      const initPromise = adapter['initDB']();
      mockIDBRequest.onsuccess?.(new Event('success'));
      
      const db = await initPromise;
      expect(db).toBe(mockIDBDatabase);
      expect(mockIndexedDB.open).toHaveBeenCalledWith('run-cache-db', 1);
    });

    it('should handle upgrade needed event', async () => {
      mockIDBDatabase.objectStoreNames.contains.mockReturnValue(false);
      const initPromise = adapter['initDB']();
      mockIDBRequest.onupgradeneeded?.(new Event('upgradeneeded'));
      mockIDBRequest.onsuccess?.(new Event('success'));

      await initPromise;
      expect(mockIDBDatabase.createObjectStore).toHaveBeenCalledWith('cache-store', { keyPath: 'id' });
    });

    it('should handle connection error', async () => {
      mockIDBRequest.error = new Error('Connection failed');
      const initPromise = adapter['initDB']();
      mockIDBRequest.onerror?.(new Event('error'));

      await expect(initPromise).rejects.toThrow('Failed to open IndexedDB: Connection failed');
    });

    it('should handle blocked event', async () => {
      const initPromise = adapter['initDB']();
      mockIDBRequest.onblocked?.(new Event('blocked'));

      await expect(initPromise).rejects.toThrow('IndexedDB connection blocked');
    });
  });

  describe('save', () => {
    it('should save data successfully', async () => {
      const testData = 'test-data';
      const putRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null
      };
      mockIDBObjectStore.put.mockReturnValue(putRequest);

      const savePromise = adapter.save(testData);
      
      // Trigger success for the database connection first
      mockIDBRequest.onsuccess?.(new Event('success'));
      
      // Then trigger success for the put request
      setTimeout(() => {
        putRequest.onsuccess?.(new Event('success'));
      }, 0);

      await savePromise;
      expect(mockIDBObjectStore.put).toHaveBeenCalledWith({ 
        id: 'run-cache-data', 
        data: testData 
      });
    });

    it('should handle save error', async () => {
      const putRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        error: new Error('Save failed')
      };
      mockIDBObjectStore.put.mockReturnValue(putRequest);

      const savePromise = adapter.save('test-data');
      
      // Trigger success for the database connection first
      mockIDBRequest.onsuccess?.(new Event('success'));
      
      // Then trigger error for the put request
      setTimeout(() => {
        putRequest.onerror?.(new Event('error'));
      }, 0);

      await expect(savePromise).rejects.toThrow('Failed to save to IndexedDB: Save failed');
    });
  });

  describe('load', () => {
    it('should load data successfully', async () => {
      const testData = 'test-data';
      const getRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        result: { data: testData }
      };
      mockIDBObjectStore.get.mockReturnValue(getRequest);

      const loadPromise = adapter.load();
      
      // Trigger success for the database connection first
      mockIDBRequest.onsuccess?.(new Event('success'));
      
      // Then trigger success for the get request
      setTimeout(() => {
        getRequest.onsuccess?.(new Event('success'));
      }, 0);

      const result = await loadPromise;
      expect(result).toBe(testData);
      expect(mockIDBObjectStore.get).toHaveBeenCalledWith('run-cache-data');
    });

    it('should return null if no data exists', async () => {
      const getRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        result: null
      };
      mockIDBObjectStore.get.mockReturnValue(getRequest);

      const loadPromise = adapter.load();
      
      // Trigger success for the database connection first
      mockIDBRequest.onsuccess?.(new Event('success'));
      
      // Then trigger success for the get request
      setTimeout(() => {
        getRequest.onsuccess?.(new Event('success'));
      }, 0);

      const result = await loadPromise;
      expect(result).toBeNull();
    });

    it('should handle load error', async () => {
      const getRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        error: new Error('Load failed')
      };
      mockIDBObjectStore.get.mockReturnValue(getRequest);

      const loadPromise = adapter.load();
      
      // Trigger success for the database connection first
      mockIDBRequest.onsuccess?.(new Event('success'));
      
      // Then trigger error for the get request
      setTimeout(() => {
        getRequest.onerror?.(new Event('error'));
      }, 0);

      await expect(loadPromise).rejects.toThrow('Failed to load from IndexedDB: Load failed');
    });
  });

  describe('clear', () => {
    it('should clear data successfully', async () => {
      const deleteRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null
      };
      mockIDBObjectStore.delete.mockReturnValue(deleteRequest);

      const clearPromise = adapter.clear();
      
      // Trigger success for the database connection first
      mockIDBRequest.onsuccess?.(new Event('success'));
      
      // Then trigger success for the delete request
      setTimeout(() => {
        deleteRequest.onsuccess?.(new Event('success'));
      }, 0);

      await clearPromise;
      expect(mockIDBObjectStore.delete).toHaveBeenCalledWith('run-cache-data');
    });

    it('should handle clear error', async () => {
      const deleteRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        error: new Error('Clear failed')
      };
      mockIDBObjectStore.delete.mockReturnValue(deleteRequest);

      const clearPromise = adapter.clear();
      
      // Trigger success for the database connection first
      mockIDBRequest.onsuccess?.(new Event('success'));
      
      // Then trigger error for the delete request
      setTimeout(() => {
        deleteRequest.onerror?.(new Event('error'));
      }, 0);

      await expect(clearPromise).rejects.toThrow('Failed to clear from IndexedDB: Clear failed');
    });
  });

  describe('close', () => {
    it('should close database connection', async () => {
      await adapter['initDB']();
      mockIDBRequest.onsuccess?.(new Event('success'));

      await adapter.close();
      expect(mockIDBDatabase.close).toHaveBeenCalled();
      expect(adapter['db']).toBeNull();
      expect(adapter['dbPromise']).toBeNull();
    });

    it('should handle no active connection', async () => {
      await adapter.close();
      expect(mockIDBDatabase.close).not.toHaveBeenCalled();
    });
  });
}); 