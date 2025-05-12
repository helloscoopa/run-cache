import { FilesystemAdapter } from './filesystem-adapter';
import { LocalStorageAdapter } from './local-storage-adapter';
import { IndexedDBAdapter } from './indexed-db-adapter';
import { RunCache } from '../run-cache';
import * as fs from 'fs/promises';
import * as path from 'path';

// Skip browser tests in node environment
const isBrowser = typeof window !== 'undefined';

describe('Storage Adapters', () => {
  beforeEach(() => {
    // Clear RunCache for each test
    RunCache.flush();
    RunCache.configure({
      storageAdapter: undefined
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
    it('should create adapter with proper config', () => {
      // Create adapter with custom key
      const adapter = new LocalStorageAdapter({ storageKey: 'test-cache' });
      
      // Just verify the adapter was created properly
      expect(adapter).toBeInstanceOf(LocalStorageAdapter);
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
  });

  describe('IndexedDBAdapter', () => {
    // Skip IndexedDB tests in Node.js environment
    (isBrowser ? it : it.skip)('should create adapter with proper config', () => {
      // Create adapter with custom key
      const adapter = new IndexedDBAdapter({ storageKey: 'test-cache' });
      
      // Just verify the adapter was created properly
      expect(adapter).toBeInstanceOf(IndexedDBAdapter);
    });
  });
}); 