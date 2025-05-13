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
  });

  describe('constructor', () => {
    it('should use default storage key for operations if not provided', async () => {
      const defaultAdapter = new IndexedDBAdapter();
      const putRequest = { onsuccess: null as ((event: Event) => void) | null };
      mockIDBObjectStore.put.mockReturnValue(putRequest);

      const savePromise = defaultAdapter.save('test-data');
      mockIDBRequest.onsuccess?.(new Event('success'));
      setTimeout(() => putRequest.onsuccess?.(new Event('success')), 0);
      await savePromise;

      expect(mockIDBObjectStore.put).toHaveBeenCalledWith({
        id: 'run-cache-data',
        data: 'test-data',
      });
    });

    it('should use custom storage key for operations if provided', async () => {
      const customAdapter = new IndexedDBAdapter({ storageKey: 'custom-key' });
      const putRequest = { onsuccess: null as ((event: Event) => void) | null };
      mockIDBObjectStore.put.mockReturnValue(putRequest);

      const savePromise = customAdapter.save('test-data');
      mockIDBRequest.onsuccess?.(new Event('success'));
      setTimeout(() => putRequest.onsuccess?.(new Event('success')), 0);
      await savePromise;

      expect(mockIDBObjectStore.put).toHaveBeenCalledWith({
        id: 'custom-key',
        data: 'test-data',
      });
    });
  });

  describe('environment verification', () => {
    it('should throw error if IndexedDB is not available', () => {
      Object.defineProperty(window, 'indexedDB', {
        value: undefined,
        writable: true,
      });

      expect(() => new IndexedDBAdapter()).toThrow(
        'IndexedDBAdapter can only be used in browser environments with IndexedDB support',
      );
    });

    it('should not throw error if IndexedDB is available', () => {
      expect(() => new IndexedDBAdapter()).not.toThrow();
    });
  });

  describe('database initialization', () => {
    it('should initialize database successfully', async () => {
      const putRequest = { onsuccess: null as ((event: Event) => void) | null };
      mockIDBObjectStore.put.mockReturnValue(putRequest);

      const savePromise = adapter.save('test-data');
      mockIDBRequest.onsuccess?.(new Event('success'));
      setTimeout(() => putRequest.onsuccess?.(new Event('success')), 0);
      await savePromise;

      expect(mockIndexedDB.open).toHaveBeenCalledWith('run-cache-db', 1);
    });

    it('should handle upgrade needed event', async () => {
      mockIDBDatabase.objectStoreNames.contains.mockReturnValue(false);
      const putRequest = { onsuccess: null as ((event: Event) => void) | null };
      mockIDBObjectStore.put.mockReturnValue(putRequest);

      const savePromise = adapter.save('test-data');
      mockIDBRequest.onupgradeneeded?.(new Event('upgradeneeded'));
      mockIDBRequest.onsuccess?.(new Event('success'));
      setTimeout(() => putRequest.onsuccess?.(new Event('success')), 0);
      await savePromise;

      expect(mockIDBDatabase.createObjectStore).toHaveBeenCalledWith('cache-store', { keyPath: 'id' });
    });

    it('should handle connection error', async () => {
      mockIDBRequest.error = new Error('Connection failed');
      const savePromise = adapter.save('test-data');
      mockIDBRequest.onerror?.(new Event('error'));

      await expect(savePromise).rejects.toThrow('Failed to open IndexedDB: Connection failed');
    });

    it('should handle blocked event', async () => {
      const savePromise = adapter.save('test-data');
      mockIDBRequest.onblocked?.(new Event('blocked'));

      await expect(savePromise).rejects.toThrow('IndexedDB connection blocked');
    });
  });

  describe('save', () => {
    it('should save data successfully', async () => {
      const testData = 'test-data';
      const putRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
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
        data: testData,
      });
    });

    it('should handle save error', async () => {
      const putRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        error: new Error('Save failed'),
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
        result: { data: testData },
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
        result: null,
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
        error: new Error('Load failed'),
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
        onerror: null as ((event: Event) => void) | null,
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
        error: new Error('Clear failed'),
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
      // First do an operation to ensure DB is initialized
      const putRequest = { onsuccess: null as ((event: Event) => void) | null };
      mockIDBObjectStore.put.mockReturnValue(putRequest);
      
      const savePromise = adapter.save('test-data');
      mockIDBRequest.onsuccess?.(new Event('success'));
      setTimeout(() => putRequest.onsuccess?.(new Event('success')), 0);
      await savePromise;

      // Now close the connection
      await adapter.close();
      expect(mockIDBDatabase.close).toHaveBeenCalled();

      // Verify DB is closed by checking if next operation initializes new connection
      const secondPutRequest = { onsuccess: null as ((event: Event) => void) | null };
      mockIDBObjectStore.put.mockReturnValue(secondPutRequest);
      
      const secondSavePromise = adapter.save('test-data');
      expect(mockIndexedDB.open).toHaveBeenCalledTimes(2); // Called again after close
      
      mockIDBRequest.onsuccess?.(new Event('success'));
      setTimeout(() => secondPutRequest.onsuccess?.(new Event('success')), 0);
      await secondSavePromise;
    });

    it('should handle no active connection during close', async () => {
      await adapter.close();
      expect(mockIDBDatabase.close).not.toHaveBeenCalled();
    });
  });
});
