# Storage Adapters

RunCache includes built-in storage adapters that allow you to persist cache data across application restarts. This page provides a complete reference for the available storage adapters and how to use them.

## Overview

Storage adapters implement a common interface to save and load cache data to/from persistent storage. RunCache includes three built-in adapters:

1. **LocalStorageAdapter**: For browser environments, uses the browser's localStorage API
2. **IndexedDBAdapter**: For browser environments, uses the browser's IndexedDB API for larger datasets
3. **FilesystemAdapter**: For Node.js environments, stores cache data in the filesystem

## Common Configuration Options

All storage adapters accept the following options (`FilesystemAdapter` also accepts `filePath`):

- `storageKey?`: `string` - The key to store under (for `FilesystemAdapter`, the file name). Default: `"run-cache-data"`
- `autoSaveInterval?`: `number` - Save at this interval in milliseconds while the adapter is attached. Default: `0` (off)
- `autoLoadOnInit?`: `boolean` - Load existing data when the adapter is attached. Default: `true`

Loaded entries are merged into the cache, keep the time remaining on their TTL, and have no source function. See [Restoring Data](../advanced/persistent-storage.md#restoring-data).

These options take effect when the adapter is attached with `RunCache.configure({ storageAdapter })`. With `autoLoadOnInit: false`, existing data is only loaded when you call `RunCache.loadFromStorage()`. A positive `autoSaveInterval` starts saving at that interval. That interval belongs to the adapter: it stops when the adapter is replaced or detached, unlike one started explicitly with `RunCache.setupAutoSave(interval)`, which keeps running. Auto-save intervals never keep a Node.js process alive on their own.

## LocalStorageAdapter

The `LocalStorageAdapter` uses the browser's localStorage API to persist cache data. This adapter is suitable for small to medium-sized cache data in web applications.

### Import

```typescript
import { RunCache, LocalStorageAdapter } from 'run-cache';
```

### Constructor

```typescript
constructor(config?: Partial<StorageAdapterConfig>)
```

#### Parameters

- `config?`: `StorageAdapterConfig` - Optional configuration options
  - `storageKey?`: `string` - Key to use in localStorage (default: "run-cache-data")

### Example Usage

```typescript
// Basic usage with default options
await RunCache.configure({
  storageAdapter: new LocalStorageAdapter()
});

// With custom options
await RunCache.configure({
  storageAdapter: new LocalStorageAdapter({
    storageKey: 'my-app-cache',
  })
});
```

### Limitations

- Limited to approximately 5-10MB of data (varies by browser)
- Synchronous API that can block the main thread with large data
- Only supports string data

## IndexedDBAdapter

The `IndexedDBAdapter` uses the browser's IndexedDB API to persist cache data. This adapter is suitable for larger datasets in web applications.

### Import

```typescript
import { RunCache, IndexedDBAdapter } from 'run-cache';
```

### Constructor

```typescript
constructor(config?: Partial<StorageAdapterConfig>)
```

#### Parameters

- `config?`: `StorageAdapterConfig` - Optional configuration options
  - `storageKey?`: `string` - Database and store name (default: "run-cache-data")

### Example Usage

```typescript
// Basic usage with default options
await RunCache.configure({
  storageAdapter: new IndexedDBAdapter()
});

// With custom options
await RunCache.configure({
  storageAdapter: new IndexedDBAdapter({
    storageKey: 'my-app-cache',
  })
});
```

### Advantages

- Supports much larger data sizes (typically 50-100MB or more)
- Asynchronous API that doesn't block the main thread
- Better performance with large datasets

### Limitations

- More complex API
- Not available in all browser contexts (e.g., some private browsing modes)

## FilesystemAdapter

The `FilesystemAdapter` stores cache data in the filesystem. This adapter is suitable for Node.js applications.

### Import

```typescript
import { RunCache, FilesystemAdapter } from 'run-cache';
```

### Constructor

```typescript
constructor(config?: FilesystemAdapterConfig)
```

#### Parameters

- `config?`: `FilesystemAdapterConfig` - Optional configuration options
  - `storageKey?`: `string` - Filename to use (default: "run-cache-data")
  - `filePath?`: `string` - Custom file path (default: current working directory)

### Example Usage

```typescript
// Basic usage with default options
await RunCache.configure({
  storageAdapter: new FilesystemAdapter()
});

// With custom options
await RunCache.configure({
  storageAdapter: new FilesystemAdapter({
    storageKey: 'my-app-cache',
    filePath: '/path/to/cache/directory',
  })
});
```

### Advantages

- Supports very large data sizes (limited only by disk space)
- Persists across application restarts
- Can be configured to store in specific locations

### Limitations

- Only available in Node.js environments. The constructor throws elsewhere. The `fs` and `path` modules are loaded on first use rather than at import time, so importing `run-cache` in a browser bundle is safe.
- Requires appropriate file system permissions
- May have performance implications with very frequent writes

## Custom Storage Adapters

You can create your own storage adapter by implementing the `StorageAdapter` interface:

```typescript
interface StorageAdapter {
  save(data: string): Promise<void>;
  load(): Promise<string | null>;
  clear(): Promise<void>;

  // Optional: picked up when the adapter is attached with configure()
  readonly autoSaveInterval?: number; // Save at this interval (ms) when > 0
  readonly autoLoadOnInit?: boolean;  // Load existing data on attach (default: true)
}
```

### Example Custom Adapter

Here's an example of a custom adapter that uses a RESTful API for storage:

```typescript
import type { StorageAdapter } from 'run-cache';

class ApiStorageAdapter implements StorageAdapter {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  async save(data: string): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ data })
      });
    } catch (error) {
      console.error('Failed to save cache to API:', error);
      throw error;
    }
  }

  async load(): Promise<string | null> {
    try {
      const response = await fetch(`${this.apiUrl}/cache`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Failed to load cache from API:', error);
      return null;
    }
  }

  async clear(): Promise<void> {
    await fetch(`${this.apiUrl}/cache`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
  }
}

// Usage
await RunCache.configure({
  storageAdapter: new ApiStorageAdapter('https://api.example.com', 'your-api-key')
});
```

## Working with Storage Adapters

### Manual Save and Load

You can manually trigger save and load operations:

```typescript
// Manually save cache state
await RunCache.saveToStorage();

// Manually load cache state
await RunCache.loadFromStorage();
```

### Auto-Save Configuration

Configure automatic saving at regular intervals:

```typescript
// Save cache to storage every 5 minutes
await RunCache.setupAutoSave(300000);

// Disable auto-saving
await RunCache.setupAutoSave(0);
```

### Storage Cleanup

To clear persistent storage, either save an empty cache or clear the adapter directly:

```typescript
// Clear cache and save empty state to storage
await RunCache.flush();
await RunCache.saveToStorage();

// Or remove the stored data, keeping the in-memory entries
await adapter.clear(); // the adapter instance passed to configure()
```

## Best Practices

### 1. Choose the Right Adapter

- Use `LocalStorageAdapter` for simple web applications with small cache data
- Use `IndexedDBAdapter` for web applications with larger cache data
- Use `FilesystemAdapter` for Node.js applications

### 2. Handle Storage Errors

`saveToStorage()` and `loadFromStorage()` do not throw on adapter errors; they return `false`. Check the result, and turn on `debug` to see the underlying error:

```typescript
if (!(await RunCache.loadFromStorage())) {
  console.warn('No cache data loaded; starting with an empty cache');
}

if (!(await RunCache.saveToStorage())) {
  console.error('Saving the cache failed (storage full or unavailable?)');
}
```

### 3. Manage Storage Size

Be mindful of storage limits, especially in browsers:

```typescript
// Configure cache with size limits
await RunCache.configure({
  maxEntries: 1000, // Limit to 1000 entries
  evictionPolicy: EvictionPolicy.LRU,
  storageAdapter: new LocalStorageAdapter()
});
```

### 4. Use Appropriate Save Intervals

Balance between data freshness and performance:

```typescript
// For frequently changing data, save more often
await RunCache.setupAutoSave(60000); // 1 minute

// For relatively stable data, save less frequently
await RunCache.setupAutoSave(3600000); // 1 hour
```

### 5. Consider Data Serialization

Be aware that all data is serialized to strings:

```typescript
// Large binary data might not be suitable for storage
// Consider storing references or URLs instead
await RunCache.set({
  key: 'large-image',
  value: imageUrl, // Store URL instead of base64 data
  ttl: 3600000
});
```

## Next Steps

- [RunCache API](./run-cache.md) - Learn about the main RunCache API
- [Events](./events.md) - Understand the event system
- [Types](./types.md) - Explore TypeScript type definitions
- [Persistent Storage](../advanced/persistent-storage.md) - Learn more about persistence strategies 