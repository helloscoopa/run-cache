import { StorageAdapter, StorageAdapterConfig } from '../types/storage-adapter';

/**
 * Storage adapter implementation for Node.js filesystem.
 * This adapter works in Node.js environments and persists cache data to the filesystem.
 */
export class FilesystemAdapter implements StorageAdapter {
  private storageKey: string;

  private fs: any = null;

  private path: any = null;

  private filePath: string = '';

  /**
   * Creates a new FilesystemAdapter instance
   * @param config Configuration options and filesystem path
   */
  constructor(config?: Partial<StorageAdapterConfig & { filePath?: string }>) {
    this.storageKey = config?.storageKey || 'run-cache-data';

    // Check if we're in a Node.js environment
    if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
      throw new Error('FilesystemAdapter can only be used in Node.js environments');
    }

    try {
      // Dynamic import for Node.js modules to avoid issues in browser environments
      this.fs = require('fs/promises');
      this.path = require('path');

      // Set the file path
      if (config?.filePath) {
        this.filePath = config.filePath;
      } else {
        // Default to current working directory
        this.filePath = this.path.join(process.cwd(), `${this.storageKey}.json`);
      }
    } catch (error) {
      throw new Error(`Failed to initialize FilesystemAdapter: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  /**
   * Verifies that the adapter is properly initialized
   * @throws Error if not initialized properly
   */
  private verifyInitialization(): void {
    if (!this.fs) {
      throw new Error('FilesystemAdapter is not properly initialized');
    }
  }

  /**
   * Ensures the directory exists for the file path
   * @throws Error if directory creation fails
   */
  private async ensureDirectory(): Promise<void> {
    const directory = this.path.dirname(this.filePath);
    try {
      await this.fs.mkdir(directory, { recursive: true });
    } catch (error) {
      throw new Error(
        `Failed to create directory: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /**
   * Store cache data to the filesystem
   * @param data The serialized cache data to store
   */
  async save(data: string): Promise<void> {
    this.verifyInitialization();

    try {
      // Ensure directory exists
      await this.ensureDirectory();

      // Write the file
      await this.fs.writeFile(this.filePath, data, 'utf8');
    } catch (error) {
      throw new Error(
        `Failed to save cache data to filesystem: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /**
   * Load cache data from the filesystem
   * @returns The serialized cache data, or null if no data exists
   */
  async load(): Promise<string | null> {
    this.verifyInitialization();

    try {
      // Check if the file exists
      try {
        await this.fs.access(this.filePath);
      } catch {
        // File doesn't exist
        return null;
      }

      // Read the file
      const data = await this.fs.readFile(this.filePath, 'utf8');
      return data;
    } catch (error) {
      if (error instanceof Error && error.message.includes('EISDIR')) {
        throw new Error('Failed to load cache data from filesystem: Path is a directory');
      }
      throw new Error(
        `Failed to load cache data from filesystem: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /**
   * Clear stored cache data from the filesystem
   */
  async clear(): Promise<void> {
    this.verifyInitialization();

    try {
      // Check if the file exists before trying to delete it
      try {
        await this.fs.access(this.filePath);
        const stats = await this.fs.stat(this.filePath);
        if (stats.isDirectory()) {
          throw new Error('Path is a directory');
        }
        await this.fs.unlink(this.filePath);
      } catch (error) {
        if (error instanceof Error && error.message === 'Path is a directory') {
          throw new Error('Failed to clear cache data from filesystem: Path is a directory');
        }
        // File doesn't exist or other error occurred during access check
        if (error instanceof Error && !error.message.includes('ENOENT')) {
          throw error;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Failed to clear')) {
        throw error;
      }
      throw new Error(
        `Failed to clear cache data from filesystem: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
