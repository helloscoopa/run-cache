# Persistent Storage

RunCache provides robust persistent storage capabilities that allow your cache data to survive application restarts or browser refreshes. This guide explains how to use persistent storage effectively in your applications.

## Understanding Persistent Storage

By default, RunCache stores all data in memory, which means cache entries are lost when:
- Your Node.js application restarts
- The user refreshes or closes their browser
- The device loses power

Persistent storage solves this problem by saving cache data to a more durable medium:
- File system (for Node.js applications)
- localStorage or IndexedDB (for browser applications)
- Custom storage backends (for specialized needs)

## Storage Adapters

RunCache uses storage adapters to abstract the details of different storage mechanisms. Three built-in adapters are provided:

1. **LocalStorageAdapter**: For browser environments, uses the browser's localStorage API
2. **IndexedDBAdapter**: For browser environments, uses the browser's IndexedDB API for larger datasets
3. **FilesystemAdapter**: For Node.js environments, stores cache data in the filesystem

## Basic Setup

### Configuring a Storage Adapter

To enable persistent storage, configure RunCache with a storage adapter:

```typescript
import { RunCache, FilesystemAdapter } from 'run-cache';

// For Node.js applications
RunCache.configure({
  storageAdapter: new FilesystemAdapter({
    storageKey: 'my-app-cache',
    autoSaveInterval: 300000 // 5 minutes
  })
});

// For browser applications with small data
RunCache.configure({
  storageAdapter: new LocalStorageAdapter({
    storageKey: 'my-app-cache',
    autoSaveInterval: 300000 // 5 minutes
  })
});

// For browser applications with larger data
RunCache.configure({
  storageAdapter: new IndexedDBAdapter({
    storageKey: 'my-app-cache',
    autoSaveInterval: 300000 // 5 minutes
  })
});
```

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

## Storage Adapters in Detail

### FilesystemAdapter

The `FilesystemAdapter` stores cache data in the filesystem. This adapter is suitable for Node.js applications.

#### Constructor Options

```typescript
interface FilesystemAdapterConfig {
  // Storage key/filename to use (default: "run-cache-data")
  storageKey?: string;
  
  // Auto-save interval in milliseconds (default: 0, disabled)
  autoSaveInterval?: number;
  
  // Whether to load cache automatically when adapter is initialized (default: true)
  autoLoadOnInit?: boolean;
  
  // Custom file path (default: current working directory)
  filePath?: string;
}
```

#### Example Usage

```typescript
import { RunCache, FilesystemAdapter } from 'run-cache';
import path from 'path';

// Basic usage
RunCache.configure({
  storageAdapter: new FilesystemAdapter()
});

// With custom options
RunCache.configure({
  storageAdapter: new FilesystemAdapter({
    storageKey: 'my-app-cache',
    filePath: path.join(process.cwd(), 'cache'),
    autoSaveInterval: 300000, // 5 minutes
    autoLoadOnInit: true
  })
});
```

#### Storage Format

The FilesystemAdapter stores data in a JSON file with the following structure:

```json
{
  "entries": {
    "key1": {
      "value": "serialized-value-1",
      "ttl": 3600000,
      "updatedAt": 1635789600000,
      "tags": ["tag1", "tag2"],
      "dependencies": ["dep1"]
    },
    "key2": {
      "value": "serialized-value-2",
      "updatedAt": 1635789600000
    }
  },
  "version": "1.0.0"
}
```

### LocalStorageAdapter

The `LocalStorageAdapter` uses the browser's localStorage API to persist cache data. This adapter is suitable for small to medium-sized cache data in web applications.

#### Constructor Options

```typescript
interface StorageAdapterConfig {
  // Key to use in localStorage (default: "run-cache-data")
  storageKey?: string;
  
  // Auto-save interval in milliseconds (default: 0, disabled)
  autoSaveInterval?: number;
  
  // Whether to load cache automatically when adapter is initialized (default: true)
  autoLoadOnInit?: boolean;
}
```

#### Example Usage

```typescript
import { RunCache, LocalStorageAdapter } from 'run-cache';

// Basic usage
RunCache.configure({
  storageAdapter: new LocalStorageAdapter()
});

// With custom options
RunCache.configure({
  storageAdapter: new LocalStorageAdapter({
    storageKey: 'my-app-cache',
    autoSaveInterval: 60000, // 1 minute
    autoLoadOnInit: true
  })
});
```

#### Limitations

- Limited to approximately 5-10MB of data (varies by browser)
- Synchronous API that can block the main thread with large data
- Only supports string data

### IndexedDBAdapter

The `IndexedDBAdapter` uses the browser's IndexedDB API to persist cache data. This adapter is suitable for larger datasets in web applications.

#### Constructor Options

```typescript
interface StorageAdapterConfig {
  // Database and store name (default: "run-cache-data")
  storageKey?: string;
  
  // Auto-save interval in milliseconds (default: 0, disabled)
  autoSaveInterval?: number;
  
  // Whether to load cache automatically when adapter is initialized (default: true)
  autoLoadOnInit?: boolean;
}
```

#### Example Usage

```typescript
import { RunCache, IndexedDBAdapter } from 'run-cache';

// Basic usage
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

#### Advantages

- Supports much larger data sizes (typically 50-100MB or more)
- Asynchronous API that doesn't block the main thread
- Better performance with large datasets

#### Limitations

- More complex API
- Not available in all browser contexts (e.g., some private browsing modes)

## Custom Storage Adapters

You can create your own storage adapter by implementing the `StorageAdapter` interface:

```typescript
interface StorageAdapter {
  save(data: string): Promise<void>;
  load(): Promise<string | null>;
}
```

### Example: Redis Storage Adapter

Here's an example of a custom adapter that uses Redis for storage:

```typescript
import { StorageAdapter } from 'run-cache';
import Redis from 'ioredis';

class RedisStorageAdapter implements StorageAdapter {
  private redis: Redis;
  private key: string;

  constructor(options: { redisUrl: string, key?: string }) {
    this.redis = new Redis(options.redisUrl);
    this.key = options.key || 'run-cache-data';
  }

  async save(data: string): Promise<void> {
    try {
      await this.redis.set(this.key, data);
    } catch (error) {
      console.error('Failed to save cache to Redis:', error);
      throw error;
    }
  }

  async load(): Promise<string | null> {
    try {
      const data = await this.redis.get(this.key);
      return data;
    } catch (error) {
      console.error('Failed to load cache from Redis:', error);
      return null;
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

// Usage
RunCache.configure({
  storageAdapter: new RedisStorageAdapter({
    redisUrl: 'redis://localhost:6379',
    key: 'my-app-cache'
  })
});
```

### Example: S3 Storage Adapter

Here's an example of a custom adapter that uses AWS S3 for storage:

```typescript
import { StorageAdapter } from 'run-cache';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

class S3StorageAdapter implements StorageAdapter {
  private s3: S3Client;
  private bucket: string;
  private key: string;

  constructor(options: { bucket: string, key?: string, region?: string }) {
    this.s3 = new S3Client({ region: options.region || 'us-east-1' });
    this.bucket = options.bucket;
    this.key = options.key || 'run-cache-data.json';
  }

  async save(data: string): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
        Body: data,
        ContentType: 'application/json'
      });
      
      await this.s3.send(command);
    } catch (error) {
      console.error('Failed to save cache to S3:', error);
      throw error;
    }
  }

  async load(): Promise<string | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.key
      });
      
      const response = await this.s3.send(command);
      const body = await response.Body?.transformToString();
      return body || null;
    } catch (error) {
      // If the object doesn't exist, return null instead of throwing
      if ((error as any).name === 'NoSuchKey') {
        return null;
      }
      
      console.error('Failed to load cache from S3:', error);
      return null;
    }
  }
}

// Usage
RunCache.configure({
  storageAdapter: new S3StorageAdapter({
    bucket: 'my-cache-bucket',
    key: 'my-app-cache.json',
    region: 'us-west-2'
  })
});
```

## Advanced Usage

### Selective Persistence

You might want to persist only certain types of cache entries. You can achieve this using middleware:

```typescript
// Add middleware to control what gets persisted
RunCache.use(async (value, context, next) => {
  // First, pass through to the actual cache operation
  const result = await next(value);
  
  // For set operations, check if we should persist this entry
  if (context.operation === 'set' && context.key.startsWith('temp:')) {
    // Mark this entry as non-persistent
    context.metadata = {
      ...context.metadata,
      persistent: false
    };
  }
  
  return result;
});

// Add middleware to filter out non-persistent entries during save
RunCache.use(async (value, context, next) => {
  if (context.operation === 'save' && value) {
    // Parse the cache state
    const cacheState = JSON.parse(value);
    
    // Filter out non-persistent entries
    const filteredEntries = {};
    for (const [key, entry] of Object.entries(cacheState.entries)) {
      if (entry.metadata?.persistent !== false) {
        filteredEntries[key] = entry;
      }
    }
    
    // Update the cache state
    cacheState.entries = filteredEntries;
    
    // Pass the filtered state to the next middleware
    return next(JSON.stringify(cacheState));
  }
  
  return next(value);
});
```

### Encryption

You might want to encrypt sensitive data before persisting it:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Encryption key and IV (in a real app, store these securely)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || randomBytes(32);
const IV = process.env.ENCRYPTION_IV || randomBytes(16);

// Add middleware for encryption
RunCache.use(async (value, context, next) => {
  if (context.operation === 'save' && value) {
    // Encrypt the data before saving
    const cipher = createCipheriv('aes-256-cbc', ENCRYPTION_KEY, IV);
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Pass the encrypted data to the next middleware
    return next(encrypted);
  } else if (context.operation === 'load' && value) {
    // Decrypt the data after loading
    try {
      const decipher = createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, IV);
      let decrypted = decipher.update(value, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      // Pass the decrypted data to the next middleware
      return next(decrypted);
    } catch (error) {
      console.error('Failed to decrypt cache data:', error);
      return next(null);
    }
  }
  
  return next(value);
});
```

### Compression

For large cache data, you might want to compress it before persisting:

```typescript
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// Add middleware for compression
RunCache.use(async (value, context, next) => {
  if (context.operation === 'save' && value) {
    // Compress the data before saving
    const compressed = await gzipAsync(Buffer.from(value, 'utf8'));
    
    // Pass the compressed data to the next middleware
    return next(compressed.toString('base64'));
  } else if (context.operation === 'load' && value) {
    // Decompress the data after loading
    try {
      const decompressed = await gunzipAsync(Buffer.from(value, 'base64'));
      
      // Pass the decompressed data to the next middleware
      return next(decompressed.toString('utf8'));
    } catch (error) {
      console.error('Failed to decompress cache data:', error);
      return next(null);
    }
  }
  
  return next(value);
});
```

## Best Practices

### 1. Choose the Right Adapter

Select the appropriate storage adapter based on your environment and requirements:

- **LocalStorageAdapter**: For browser environments with small cache data
- **IndexedDBAdapter**: For browser environments with larger cache data
- **FilesystemAdapter**: For Node.js applications
- **Custom Adapter**: For specialized needs (Redis, S3, etc.)

### 2. Set Appropriate Save Intervals

Balance between data freshness and performance:

```typescript
// For frequently changing data, save more often
RunCache.setupAutoSave(60000); // 1 minute

// For relatively stable data, save less frequently
RunCache.setupAutoSave(3600000); // 1 hour
```

### 3. Handle Storage Errors

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

### 4. Implement Graceful Shutdown

For Node.js applications, ensure cache is saved before shutting down:

```typescript
// Handle process termination signals
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, saving cache...');
  try {
    await RunCache.saveToStorage();
    console.log('Cache saved successfully');
    process.exit(0);
  } catch (error) {
    console.error('Failed to save cache:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, saving cache...');
  try {
    await RunCache.saveToStorage();
    console.log('Cache saved successfully');
    process.exit(0);
  } catch (error) {
    console.error('Failed to save cache:', error);
    process.exit(1);
  }
});
```

### 5. Consider Storage Size Limits

Be mindful of storage limits, especially in browsers:

```typescript
// Configure cache with size limits
RunCache.configure({
  maxSize: 1000, // Limit to 1000 entries
  evictionPolicy: EvictionPolicy.LRU,
  storageAdapter: new LocalStorageAdapter()
});
```

### 6. Implement Version Migration

Handle version migrations gracefully:

```typescript
// Add middleware for version migration
RunCache.use(async (value, context, next) => {
  if (context.operation === 'load' && value) {
    try {
      const data = JSON.parse(value);
      
      // Check version and migrate if needed
      if (data.version === '1.0.0') {
        console.log('Migrating cache data from v1.0.0 to v1.1.0');
        
        // Perform migration
        // ...
        
        // Update version
        data.version = '1.1.0';
        
        // Return migrated data
        return next(JSON.stringify(data));
      }
      
      // No migration needed
      return next(value);
    } catch (error) {
      console.error('Failed to parse or migrate cache data:', error);
      return next(null);
    }
  }
  
  return next(value);
});
```

## Common Scenarios

### 1. Browser Application with User-specific Data

```typescript
import { RunCache, LocalStorageAdapter } from 'run-cache';

// Initialize with user-specific storage key
function initializeCache(userId) {
  RunCache.configure({
    storageAdapter: new LocalStorageAdapter({
      storageKey: `user-${userId}-cache`,
      autoSaveInterval: 60000 // 1 minute
    })
  });
  
  // Load data from storage
  return RunCache.loadFromStorage();
}

// Usage
async function onUserLogin(userId) {
  await initializeCache(userId);
  
  // Cache is now loaded with user-specific data
  const userData = await RunCache.get('user:profile');
  if (userData) {
    // Use cached data
    displayUserProfile(JSON.parse(userData));
  } else {
    // Fetch and cache data
    const profile = await fetchUserProfile(userId);
    await RunCache.set({
      key: 'user:profile',
      value: JSON.stringify(profile)
    });
    displayUserProfile(profile);
  }
}

// Handle logout
async function onUserLogout() {
  // Save any pending changes
  await RunCache.saveToStorage();
  
  // Clear the cache
  await RunCache.flush();
}
```

### 2. Node.js Application with Filesystem Storage

```typescript
import { RunCache, FilesystemAdapter } from 'run-cache';
import path from 'path';

// Initialize cache with filesystem storage
async function initializeCache() {
  const cacheDir = path.join(process.cwd(), 'cache');
  
  RunCache.configure({
    maxSize: 10000,
    evictionPolicy: EvictionPolicy.LRU,
    storageAdapter: new FilesystemAdapter({
      storageKey: 'app-cache',
      filePath: cacheDir,
      autoSaveInterval: 300000 // 5 minutes
    })
  });
  
  try {
    await RunCache.loadFromStorage();
    console.log('Cache loaded successfully');
  } catch (error) {
    console.error('Failed to load cache:', error);
    // Continue with empty cache
  }
}

// Usage
async function startApplication() {
  await initializeCache();
  
  // Application startup logic
  // ...
}

startApplication();
```

### 3. Multi-environment Application

```typescript
import { RunCache, LocalStorageAdapter, FilesystemAdapter } from 'run-cache';

// Initialize cache based on environment
async function initializeCache() {
  const isBrowser = typeof window !== 'undefined';
  
  if (isBrowser) {
    // Browser environment
    RunCache.configure({
      storageAdapter: new LocalStorageAdapter({
        storageKey: 'app-cache',
        autoSaveInterval: 60000 // 1 minute
      })
    });
  } else {
    // Node.js environment
    RunCache.configure({
      storageAdapter: new FilesystemAdapter({
        storageKey: 'app-cache',
        autoSaveInterval: 300000 // 5 minutes
      })
    });
  }
  
  try {
    await RunCache.loadFromStorage();
    console.log('Cache loaded successfully');
  } catch (error) {
    console.error('Failed to load cache:', error);
    // Continue with empty cache
  }
}

// Usage
initializeCache();
```

## Next Steps

Now that you understand persistent storage, explore these related topics:

- [Storage Adapters](../api/storage-adapters.md) - Learn more about the built-in storage adapters
- [Middleware](./middleware.md) - Understand how to intercept and transform cache operations
- [Resource Management](./resource-management.md) - Learn about memory management and cleanup
- [Event System](./event-system.md) - Explore how to use events to monitor cache operations 