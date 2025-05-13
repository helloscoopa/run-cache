import * as fs from 'fs/promises';
import * as path from 'path';
import { FilesystemAdapter } from './filesystem-adapter';
import { LocalStorageAdapter } from './local-storage-adapter';
import { IndexedDBAdapter } from './indexed-db-adapter';
import { RunCache } from '../run-cache';

// Skip browser tests in node environment
const isBrowser = typeof window !== 'undefined';

describe('Storage Adapters', () => {
  beforeEach(() => {
    // Clear RunCache for each test
    RunCache.flush();
    RunCache.configure({
      storageAdapter: undefined,
    });

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up any test files
    try {
      await fs.unlink(path.join(process.cwd(), 'test-cache.json'));
    } catch (error) {
      // Ignore errors if file doesn't exist
    }
  });

  describe('LocalStorageAdapter', () => {
    // Skip localStorage tests in Node.js environment
    (isBrowser ? it : it.skip)('should create adapter with proper config', () => {
      // Create adapter with custom key
      const adapter = new LocalStorageAdapter({ storageKey: 'test-cache' });

      // Just verify the adapter was created properly
      expect(adapter).toBeInstanceOf(LocalStorageAdapter);
    });

    // Skip localStorage functionality tests in Node.js environment
    (isBrowser ? it : it.skip)('should save, load, and clear data correctly', async () => {
      // Create adapter with custom key
      const adapter = new LocalStorageAdapter({ storageKey: 'test-cache' });
      const testData = JSON.stringify({ test: 'data' });

      // Mock localStorage methods if needed
      const getItemSpy = jest.spyOn(window.localStorage, 'getItem');
      const setItemSpy = jest.spyOn(window.localStorage, 'setItem');
      const removeItemSpy = jest.spyOn(window.localStorage, 'removeItem');

      // Test save
      await adapter.save(testData);
      expect(setItemSpy).toHaveBeenCalledWith('test-cache', testData);

      // Test load
      const loadedData = await adapter.load();
      expect(getItemSpy).toHaveBeenCalledWith('test-cache');
      expect(loadedData).toBe(testData);

      // Test clear
      await adapter.clear();
      expect(removeItemSpy).toHaveBeenCalledWith('test-cache');

      // Verify data is cleared
      const clearedData = await adapter.load();
      expect(clearedData).toBeNull();
    });
  });

  describe('FilesystemAdapter', () => {
    it('should create adapter with proper config', () => {
      // Create adapter with custom path
      const testPath = path.join(process.cwd(), 'test-cache.json');
      const adapter = new FilesystemAdapter({ filePath: testPath });

      // Just verify the adapter was created properly
      expect(adapter).toBeInstanceOf(FilesystemAdapter);
    });

    it('should save, load, and clear data correctly', async () => {
      const testPath = path.join(process.cwd(), 'test-cache.json');
      const adapter = new FilesystemAdapter({ filePath: testPath });
      const testData = JSON.stringify({ test: 'data' });

      // Test save
      await adapter.save(testData);

      // Verify file exists with correct content
      const fileContent = await fs.readFile(testPath, 'utf8');
      expect(fileContent).toBe(testData);

      // Test load
      const loadedData = await adapter.load();
      expect(loadedData).toBe(testData);

      // Test clear
      await adapter.clear();

      // Verify file no longer exists
      try {
        await fs.access(testPath);
        expect(false).toBe(true); // File should not exist after clear
      } catch (error) {
        // Expected - file should not exist
      }

      // Test load when no data exists
      const emptyData = await adapter.load();
      expect(emptyData).toBeNull();
    });

    it('should handle errors appropriately', async () => {
      // Create adapter with an invalid path that will cause a write error
      const invalidPath = '/non-existent-directory/test-cache.json';
      const adapter = new FilesystemAdapter({ filePath: invalidPath });
      const testData = JSON.stringify({ test: 'data' });

      // Test save with invalid path
      await expect(adapter.save(testData)).rejects.toThrow();

      // Test load when file doesn't exist
      const loadedData = await adapter.load();
      expect(loadedData).toBeNull();

      // Test clear when file doesn't exist should not throw
      await expect(adapter.clear()).resolves.not.toThrow();
    });
  });

  describe('IndexedDBAdapter', () => {
    // Skip IndexedDB tests in Node.js environment
    (isBrowser ? it : it.skip)('should create adapter with proper config', () => {
      // Create adapter with custom key
      const adapter = new IndexedDBAdapter({ storageKey: 'test-cache' });

      // Just verify the adapter was created properly
      expect(adapter).toBeInstanceOf(IndexedDBAdapter);
    });

    // Skip IndexedDB functionality tests in Node.js environment
    (isBrowser ? it : it.skip)('should save, load, and clear data correctly', async () => {
      // Create adapter with custom key
      const adapter = new IndexedDBAdapter({ storageKey: 'test-cache' });
      const testData = JSON.stringify({ test: 'data' });

      // Test save
      await adapter.save(testData);

      // Test load
      const loadedData = await adapter.load();
      expect(loadedData).toBe(testData);

      // Test clear
      await adapter.clear();

      // Verify data is cleared
      const clearedData = await adapter.load();
      expect(clearedData).toBeNull();
    });
  });
});
