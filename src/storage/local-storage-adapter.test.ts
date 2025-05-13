import { LocalStorageAdapter } from './local-storage-adapter';

describe('LocalStorageAdapter', () => {
  let adapter: LocalStorageAdapter;
  const mockLocalStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  };

  beforeEach(() => {
    // Setup mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    // Clear mocks before each test
    jest.clearAllMocks();

    // Create adapter instance
    adapter = new LocalStorageAdapter({ storageKey: 'test-cache' });
  });

  describe('constructor', () => {
    it('should use default storage key if not provided', () => {
      const defaultAdapter = new LocalStorageAdapter();
      expect(defaultAdapter['storageKey']).toBe('run-cache-data');
    });

    it('should use custom storage key if provided', () => {
      const customAdapter = new LocalStorageAdapter({ storageKey: 'custom-key' });
      expect(customAdapter['storageKey']).toBe('custom-key');
    });
  });

  describe('verifyEnvironment', () => {
    it('should throw error if localStorage is not available', () => {
      Object.defineProperty(window, 'localStorage', {
        value: undefined,
        writable: true,
      });

      expect(() => adapter['verifyEnvironment']()).toThrow(
        'LocalStorageAdapter can only be used in browser environments with localStorage support'
      );
    });

    it('should not throw error if localStorage is available', () => {
      expect(() => adapter['verifyEnvironment']()).not.toThrow();
    });
  });

  describe('save', () => {
    it('should save data correctly', async () => {
      const testData = JSON.stringify({ test: 'data' });
      await adapter.save(testData);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('test-cache', testData);
    });

    it('should handle save errors', async () => {
      const testData = JSON.stringify({ test: 'data' });
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage full');
      });

      await expect(adapter.save(testData)).rejects.toThrow('Failed to save cache data to localStorage: Storage full');
    });
  });

  describe('load', () => {
    it('should load data correctly', async () => {
      const testData = JSON.stringify({ test: 'data' });
      mockLocalStorage.getItem.mockReturnValue(testData);

      const loadedData = await adapter.load();
      expect(loadedData).toBe(testData);
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('test-cache');
    });

    it('should return null when no data exists', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      const loadedData = await adapter.load();
      expect(loadedData).toBeNull();
    });

    it('should handle load errors', async () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      await expect(adapter.load()).rejects.toThrow('Storage error');
    });
  });

  describe('clear', () => {
    it('should clear data correctly', async () => {
      await adapter.clear();
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('test-cache');
    });

    it('should handle clear errors', async () => {
      mockLocalStorage.removeItem.mockImplementation(() => {
        throw new Error('Clear error');
      });

      await expect(adapter.clear()).rejects.toThrow('Clear error');
    });
  });
}); 