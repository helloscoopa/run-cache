import { StorageAdapter, StorageAdapterConfig } from '../types/storage-adapter';

/**
 * Loads a Node.js built-in module on demand.
 *
 * The specifier is passed through a variable (and marked with bundler ignore comments)
 * so browser bundlers do not try to resolve Node built-ins when this file is included
 * in a bundle. It works from both the CommonJS and the ESM builds.
 */
async function loadNodeModule(name: string): Promise<any> {
  const specifier = name;
  const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ specifier);
  return mod.default ?? mod;
}

/**
 * Storage adapter implementation for Node.js filesystem.
 * This adapter works in Node.js environments and persists cache data to the filesystem.
 */
export class FilesystemAdapter implements StorageAdapter {
  private storageKey: string;

  /** Auto-save interval in milliseconds, from the `autoSaveInterval` option (0 disables) */
  readonly autoSaveInterval: number;

  /** Whether existing data is loaded when the adapter is attached, from the `autoLoadOnInit` option */
  readonly autoLoadOnInit: boolean;

  private fs: any = null;

  private path: any = null;

  private filePath: string = '';

  private configuredFilePath?: string;

  private modulesPromise: Promise<void> | null = null;

  /**
   * Creates a new FilesystemAdapter instance
   * @param config Configuration options and filesystem path
   */
  constructor(config?: Partial<StorageAdapterConfig & { filePath?: string }>) {
    this.storageKey = config?.storageKey || 'run-cache-data';
    this.autoSaveInterval = config?.autoSaveInterval ?? 0;
    this.autoLoadOnInit = config?.autoLoadOnInit ?? true;

    // Check if we're in a Node.js environment
    if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
      throw new Error('FilesystemAdapter can only be used in Node.js environments');
    }

    this.configuredFilePath = config?.filePath;
    this.filePath = config?.filePath ?? '';
  }

  /**
   * Loads the `fs/promises` and `path` modules on first use and resolves the file path.
   * Loading lazily keeps Node.js built-ins out of browser bundles.
   * @throws Error if the modules cannot be loaded
   */
  private async verifyInitialization(): Promise<void> {
    if (!this.modulesPromise) {
      this.modulesPromise = (async () => {
        this.fs = await loadNodeModule('fs/promises');
        this.path = await loadNodeModule('path');
        // Default to current working directory
        this.filePath = this.configuredFilePath
          ?? this.path.join(process.cwd(), `${this.storageKey}.json`);
      })().catch((error) => {
        this.modulesPromise = null;
        throw new Error(`Failed to initialize FilesystemAdapter: ${error instanceof Error ? error.message : 'unknown error'}`);
      });
    }
    await this.modulesPromise;
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
    await this.verifyInitialization();

    try {
      // Ensure directory exists
      await this.ensureDirectory();

      // Write to a temporary file in the same directory, then rename it over the target.
      // The rename is atomic, so a crash mid-write never leaves a truncated cache file.
      const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      try {
        await this.fs.writeFile(tempPath, data, 'utf8');
        await this.fs.rename(tempPath, this.filePath);
      } catch (error) {
        await this.fs.unlink(tempPath).catch(() => { /* temp file may not exist */ });
        throw error;
      }
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
    await this.verifyInitialization();

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
    await this.verifyInitialization();

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
