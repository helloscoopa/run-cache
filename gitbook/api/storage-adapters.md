# Storage Adapters

RunCache includes built-in storage adapters that allow you to persist cache data across application restarts. This page provides a complete reference for the available storage adapters and how to use them.

## Overview

Storage adapters implement a common interface to save and load cache data to/from persistent storage. RunCache includes three built-in adapters:

1. **LocalStorageAdapter**: For browser environments, uses the browser's localStorage API
2. **IndexedDBAdapter**: For browser environments, uses the browser's IndexedDB API for larger datasets
3. **FilesystemAdapter**: For Node.js environments, stores cache data in the filesystem

## Common Configuration Options

All storage adapters accept the following common options:

```typescript
interface StorageAdapterConfig {
  // Storage key/filename to use
  storageKey?: string; // Default: "run-cache-data"
  
  // Auto-save interval in milliseconds
  autoSaveInterval?: number; // Default: 0 (disabled)
  
  // Whether to load cache automatically when adapter is initialized
  autoLoadOnInit?: boolean; // Default: true
}
```

## LocalStorageAdapter

The `LocalStorageAdapter` uses the browser's localStorage API to persist cache data. This adapter is suitable for small to medium-sized cache data in web applications.

### Import

```typescript
import { RunCache, LocalStorageAdapter } from 'run-cache';
```

### Constructor

```typescript
constructor(config?: StorageAdapterConfig)
```

#### Parameters

- `config?`: `StorageAdapterConfig` - Optional configuration options
  - `storageKey?`: `string` - Key to use in localStorage (default: "run-cache-data")
  - `autoSaveInterval?`: `number` - Auto-save interval in milliseconds (default: 0)
  - `autoLoadOnInit?`: `boolean` - Whether to load cache automatically when adapter is initialized (default: true)

### Example Usage

```typescript
// Basic usage with default options
RunCache.configure({
  storageAdapter: new LocalStorageAdapter()
});

// With custom options
RunCache.configure({
  storageAdapter: new LocalStorageAdapter({
    storageKey: 'my-app-cache',
    autoSaveInterval: 300000, // 5 minutes
    autoLoadOnInit: true
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
constructor(config?: StorageAdapterConfig)
```

#### Parameters

- `config?`: `StorageAdapterConfig` - Optional configuration options
  - `storageKey?`: `string` - Database and store name (default: "run-cache-data")
  - `autoSaveInterval?`: `number` - Auto-save interval in milliseconds (default: 0)
  - `autoLoadOnInit?`: `boolean` - Whether to load cache automatically when adapter is initialized (default: true)

### Example Usage

```typescript
// Basic usage with default options
RunCache.configure({
  storageAdapter: new IndexedDBAdapter()
});

// With custom options
RunCache.configure({
  storageAdapter: new IndexedDBAdapter({
    storageKey: 'my-app-cache',
    autoSaveInterval: 300000, // 5 minutes
    autoLoadOnInit: true
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
  - `autoSaveInterval?`: `number` - Auto-save interval in milliseconds (default: 0)
  - `autoLoadOnInit?`: `boolean` - Whether to load cache automatically when adapter is initialized (default: true)
  - `filePath?`: `string` - Custom file path (default: current working directory)

### Example Usage

```typescript
// Basic usage with default options
RunCache.configure({
  storageAdapter: new FilesystemAdapter()
});

// With custom options
RunCache.configure({
  storageAdapter: new FilesystemAdapter({
    storageKey: 'my-app-cache',
    filePath: '/path/to/cache/directory',
    autoSaveInterval: 300000, // 5 minutes
    autoLoadOnInit: true
  })
});
```

### Advantages

- Supports very large data sizes (limited only by disk space)
- Persists across application restarts
- Can be configured to store in specific locations

### Limitations

- Only available in Node.js environments
- Requires appropriate file system permissions
- May have performance implications with very frequent writes

## Custom Storage Adapters

You can create your own storage adapter by implementing the `StorageAdapter` interface:

```typescript
interface StorageAdapter {
  save(data: string): Promise<void>;
  load(): Promise<string | null>;
}
```

### Example Custom Adapter

Here's an example of a custom adapter that uses a RESTful API for storage:

```typescript
import { StorageAdapter } from 'run-cache';

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
}

// Usage
RunCache.configure({
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
RunCache.setupAutoSave(300000);

// Disable auto-saving
RunCache.setupAutoSave(0);
```

### Storage Cleanup

To clear persistent storage:

```typescript
// Clear cache and save empty state to storage
RunCache.flush();
await RunCache.saveToStorage();
```

## Best Practices

### 1. Choose the Right Adapter

- Use `LocalStorageAdapter` for simple web applications with small cache data
- Use `IndexedDBAdapter` for web applications with larger cache data
- Use `FilesystemAdapter` for Node.js applications

### 2. Handle Storage Errors

Always handle potential storage errors:

```typescript
try {
  await RunCache.loadFromStorage();
  console.log('Cache loaded successfully');
} catch (error) {
  console.error('Failed to load cache:', error);
  // Implement fallback mechanism
}
```

### 3. Manage Storage Size

Be mindful of storage limits, especially in browsers:

```typescript
// Configure cache with size limits
RunCache.configure({
  maxSize: 1000, // Limit to 1000 entries
  evictionPolicy: EvictionPolicy.LRU,
  storageAdapter: new LocalStorageAdapter()
});
```

### 4. Use Appropriate Save Intervals

Balance between data freshness and performance:

```typescript
// For frequently changing data, save more often
RunCache.setupAutoSave(60000); // 1 minute

// For relatively stable data, save less frequently
RunCache.setupAutoSave(3600000); // 1 hour
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