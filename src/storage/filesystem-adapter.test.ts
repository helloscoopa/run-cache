import * as fs from 'fs/promises';
import * as path from 'path';
import { FilesystemAdapter } from './filesystem-adapter';

// Mock process.versions.node to simulate Node.js environment
const originalProcess = global.process;
beforeAll(() => {
  Object.defineProperty(global, 'process', {
    value: {
      ...originalProcess,
      versions: { node: '16.0.0' },
    },
  });
});

afterAll(() => {
  Object.defineProperty(global, 'process', {
    value: originalProcess,
  });
});

describe('FilesystemAdapter', () => {
  let adapter: FilesystemAdapter;
  const testDir = path.join(process.cwd(), 'test-cache-dir');
  const testPath = path.join(testDir, 'test-cache.json');

  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
    // Create a new adapter instance before each test
    adapter = new FilesystemAdapter({ filePath: testPath });
  });

  afterEach(async () => {
    // Clean up test files after each test
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
  });

  describe('constructor', () => {
    it('should use default file path if not provided', async () => {
      const defaultAdapter = new FilesystemAdapter();
      const defaultPath = path.join(process.cwd(), 'run-cache-data.json');
      
      // Save some data to verify the path
      await defaultAdapter.save('test');
      const exists = await fs.access(defaultPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
      
      // Clean up
      await fs.unlink(defaultPath);
    });

    it('should use custom file path if provided', async () => {
      const customPath = path.join(process.cwd(), 'custom-cache.json');
      const customAdapter = new FilesystemAdapter({ filePath: customPath });
      
      // Save some data to verify the path
      await customAdapter.save('test');
      const exists = await fs.access(customPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
      
      // Clean up
      await fs.unlink(customPath);
    });

    it('should throw error if not in Node.js environment', () => {
      // Temporarily remove process.versions.node
      const { versions } = process;
      Object.defineProperty(process, 'versions', { value: undefined });

      expect(() => new FilesystemAdapter()).toThrow('FilesystemAdapter can only be used in Node.js environments');

      // Restore process.versions
      Object.defineProperty(process, 'versions', { value: versions });
    });
  });

  describe('save', () => {
    it('should save data to file successfully', async () => {
      const testData = JSON.stringify({ test: 'data' });
      await adapter.save(testData);

      const fileContent = await fs.readFile(testPath, 'utf8');
      expect(fileContent).toBe(testData);
    });

    it('should handle save errors gracefully', async () => {
      // Create adapter with invalid path (using a file as directory)
      const invalidPath = path.join(testPath, 'invalid.json');
      await fs.writeFile(testPath, ''); // Create a file instead of directory

      const invalidAdapter = new FilesystemAdapter({ filePath: invalidPath });
      const testData = JSON.stringify({ test: 'data' });

      await expect(invalidAdapter.save(testData)).rejects.toThrow('Failed to save cache data to filesystem');
    });

    it('should create directory if it does not exist', async () => {
      const nestedDir = path.join(testDir, 'nested');
      const filePath = path.join(nestedDir, 'test-cache.json');
      const dirAdapter = new FilesystemAdapter({ filePath });

      const testData = JSON.stringify({ test: 'data' });
      await dirAdapter.save(testData);

      const fileContent = await fs.readFile(filePath, 'utf8');
      expect(fileContent).toBe(testData);
    });
  });

  describe('load', () => {
    it('should load data from file successfully', async () => {
      const testData = JSON.stringify({ test: 'data' });
      await fs.writeFile(testPath, testData);

      const loadedData = await adapter.load();
      expect(loadedData).toBe(testData);
    });

    it('should return null when file does not exist', async () => {
      const loadedData = await adapter.load();
      expect(loadedData).toBeNull();
    });

    it('should handle load errors gracefully', async () => {
      // Create a directory at the file path to cause a read error
      await fs.mkdir(testPath, { recursive: true });

      await expect(adapter.load()).rejects.toThrow('Failed to load cache data from filesystem');
    });
  });

  describe('clear', () => {
    it('should clear file successfully', async () => {
      // First save some data
      const testData = JSON.stringify({ test: 'data' });
      await adapter.save(testData);

      // Then clear it
      await adapter.clear();

      // Verify file no longer exists
      await expect(fs.access(testPath)).rejects.toThrow();
    });

    it('should not throw when clearing non-existent file', async () => {
      await expect(adapter.clear()).resolves.not.toThrow();
    });

    it('should handle clear errors gracefully', async () => {
      // Create a directory at the file path to cause a delete error
      await fs.mkdir(testPath, { recursive: true });

      // Create a file inside the directory to make it non-empty
      const filePath = path.join(testPath, 'file.txt');
      await fs.writeFile(filePath, 'test');

      await expect(adapter.clear()).rejects.toThrow('Failed to clear cache data from filesystem');
    });
  });
});
