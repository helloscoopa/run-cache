# TypeScript Types

RunCache is built with TypeScript and provides comprehensive type definitions to help you write type-safe code. This page documents all the TypeScript types, interfaces, and enums available in the RunCache library.

## Core Types

### RunCacheConfig

Configuration options for RunCache.

```typescript
interface RunCacheConfig {
  /**
   * Maximum number of entries before eviction
   */
  maxEntries?: number;
  
  /**
   * Eviction policy to use
   */
  evictionPolicy?: EvictionPolicy;
  
  /**
   * Enable debug logging
   */
  debug?: boolean;
  
  /**
   * Storage adapter for persistence
   */
  storageAdapter?: StorageAdapter;
}
```

### SetOptions

Options for setting a cache entry.

```typescript
interface SetOptions {
  /**
   * Unique identifier for the cache entry
   */
  key: string;
  
  /**
   * String value to cache (required if no sourceFn)
   */
  value?: string;
  
  /**
   * Time-to-live in milliseconds
   */
  ttl?: number;
  
  /**
   * Automatically refetch on expiry (requires ttl and sourceFn)
   */
  autoRefetch?: boolean;
  
  /**
   * Function to generate cache value (required if no value)
   */
  sourceFn?: () => string | Promise<string>;
  
  /**
   * Array of tags for tag-based invalidation
   */
  tags?: string[];
  
  /**
   * Array of cache keys this entry depends on
   */
  dependencies?: string[];
  
  /**
   * Custom metadata to associate with the entry
   */
  metadata?: any;
}
```

### RefetchOptions

Options for refreshing a cache entry.

```typescript
interface RefetchOptions {
  /**
   * Custom metadata to include in refetch events
   */
  metadata?: any;
}
```

## Event Types

### EventName

Union type of all possible event names.

```typescript
type EventName = 'expire' | 'refetch' | 'refetch_failure' | 'tag_invalidation' | 'dependency_invalidation';
```

### EVENT

Enum for event types.

```typescript
enum EVENT {
  EXPIRE = 'expire',
  REFETCH = 'refetch',
  REFETCH_FAILURE = 'refetch_failure',
  TAG_INVALIDATION = 'tag_invalidation',
  DEPENDENCY_INVALIDATION = 'dependency_invalidation'
}
```

### EventParam

Union type of all possible event objects.

```typescript
type EventParam = ExpiryEvent | RefetchEvent | RefetchFailureEvent | TagInvalidationEvent | DependencyInvalidationEvent;
```

### ExpiryEvent

Event object for expiry events.

```typescript
interface ExpiryEvent {
  /**
   * The key of the expired entry
   */
  key: string;
  
  /**
   * The TTL value in milliseconds
   */
  ttl: number;
  
  /**
   * Timestamp when the entry was last updated
   */
  updatedAt: number;
  
  /**
   * Optional custom metadata associated with the entry
   */
  metadata?: any;
}
```

### RefetchEvent

Event object for refetch events.

```typescript
interface RefetchEvent {
  /**
   * The key of the refreshed entry
   */
  key: string;
  
  /**
   * Optional custom metadata associated with the entry
   */
  metadata?: any;
}
```

### RefetchFailureEvent

Event object for refetch failure events.

```typescript
interface RefetchFailureEvent {
  /**
   * The key of the entry that failed to refresh
   */
  key: string;
  
  /**
   * The error that occurred during refresh
   */
  error: Error;
  
  /**
   * Optional custom metadata associated with the entry
   */
  metadata?: any;
}
```

### TagInvalidationEvent

Event object for tag invalidation events.

```typescript
interface TagInvalidationEvent {
  /**
   * The key of the invalidated entry
   */
  key: string;
  
  /**
   * The tag that caused the invalidation
   */
  tag: string;
  
  /**
   * Optional custom metadata associated with the entry
   */
  metadata?: any;
}
```

### DependencyInvalidationEvent

Event object for dependency invalidation events.

```typescript
interface DependencyInvalidationEvent {
  /**
   * The key of the invalidated entry
   */
  key: string;
  
  /**
   * The key of the dependency that caused the invalidation
   */
  dependencyKey: string;
  
  /**
   * Optional custom metadata associated with the entry
   */
  metadata?: any;
}
```

### EventListenerOptions

Options for clearing event listeners.

```typescript
interface EventListenerOptions {
  /**
   * The event type to remove listeners for
   */
  event?: EVENT;
  
  /**
   * The key or pattern to remove listeners for
   */
  key?: string;
  
  /**
   * The specific handler function to remove
   */
  handler?: Function;
}
```

## Middleware Types

### MiddlewareFunction

Type definition for middleware functions.

```typescript
type MiddlewareFunction = (
  value: string | undefined,
  context: MiddlewareContext,
  next: (value: string | undefined) => Promise<string | undefined>
) => Promise<string | undefined>;
```

### MiddlewareContext

Context object passed to middleware functions.

```typescript
interface MiddlewareContext {
  /**
   * The operation being performed
   */
  operation: 'get' | 'set' | 'delete' | 'refetch' | 'evict';
  
  /**
   * The key of the cache entry
   */
  key: string;
  
  /**
   * Optional custom metadata associated with the entry
   */
  metadata?: any;
}
```

## Storage Types

### StorageAdapter

Interface for storage adapters.

```typescript
interface StorageAdapter {
  /**
   * Save cache data to storage
   * @param data The stringified cache data
   */
  save(data: string): Promise<void>;
  
  /**
   * Load cache data from storage
   * @returns The stringified cache data or null if not found
   */
  load(): Promise<string | null>;
}
```

### StorageAdapterConfig

Common configuration options for storage adapters.

```typescript
interface StorageAdapterConfig {
  /**
   * Storage key/filename to use
   * @default "run-cache-data"
   */
  storageKey?: string;
  
  /**
   * Auto-save interval in milliseconds
   * @default 0 (disabled)
   */
  autoSaveInterval?: number;
  
  /**
   * Whether to load cache automatically when adapter is initialized
   * @default true
   */
  autoLoadOnInit?: boolean;
}
```

### FilesystemAdapterConfig

Configuration options specific to FilesystemAdapter.

```typescript
interface FilesystemAdapterConfig extends StorageAdapterConfig {
  /**
   * Custom file path
   * @default current working directory
   */
  filePath?: string;
}
```

## Enums

### EvictionPolicy

Enum for cache eviction policies.

```typescript
enum EvictionPolicy {
  /**
   * No automatic eviction
   */
  NONE = 'none',
  
  /**
   * Least Recently Used eviction policy
   */
  LRU = 'lru',
  
  /**
   * Least Frequently Used eviction policy
   */
  LFU = 'lfu'
}
```

## Internal Types

These types are used internally by RunCache but may be useful for understanding the library's implementation.

### CacheEntry

Represents a single cache entry.

```typescript
interface CacheEntry {
  /**
   * The cached value
   */
  value: string;
  
  /**
   * Time-to-live in milliseconds
   */
  ttl?: number;
  
  /**
   * Timestamp when the entry was last updated
   */
  updatedAt: number;
  
  /**
   * Timestamp when the entry was last accessed
   */
  accessedAt: number;
  
  /**
   * Number of times the entry has been accessed
   */
  accessCount: number;
  
  /**
   * Function to generate cache value
   */
  sourceFn?: () => string | Promise<string>;
  
  /**
   * Whether to automatically refetch on expiry
   */
  autoRefetch?: boolean;
  
  /**
   * Array of tags associated with the entry
   */
  tags?: string[];
  
  /**
   * Array of cache keys this entry depends on
   */
  dependencies?: string[];
  
  /**
   * Custom metadata associated with the entry
   */
  metadata?: any;
}
```

### CacheState

Represents the entire cache state.

```typescript
interface CacheState {
  /**
   * Map of cache entries
   */
  entries: Map<string, CacheEntry>;
  
  /**
   * Map of tags to sets of keys
   */
  tagMap: Map<string, Set<string>>;
  
  /**
   * Map of dependencies to sets of dependent keys
   */
  dependencyMap: Map<string, Set<string>>;
  
  /**
   * Cache configuration
   */
  config: RunCacheConfig;
}
```

## Using Types in Your Code

### Import Types

```typescript
import {
  RunCache,
  EvictionPolicy,
  EVENT,
  type RunCacheConfig,
  type SetOptions,
  type StorageAdapter,
  type MiddlewareFunction
} from 'run-cache';
```

### Example: Configuring RunCache with Types

```typescript
import { RunCache, EvictionPolicy, type RunCacheConfig } from 'run-cache';

const config: RunCacheConfig = {
  maxEntries: 1000,
  evictionPolicy: EvictionPolicy.LRU,
  debug: true
};

RunCache.configure(config);
```

### Example: Setting Cache Entry with Types

```typescript
import { RunCache, type SetOptions } from 'run-cache';

const options: SetOptions = {
  key: 'user:1',
  value: JSON.stringify({ name: 'John Doe' }),
  ttl: 3600000,
  tags: ['user', 'user:1']
};

await RunCache.set(options);
```

### Example: Creating a Custom Storage Adapter

```typescript
import { StorageAdapter } from 'run-cache';

class CustomStorageAdapter implements StorageAdapter {
  async save(data: string): Promise<void> {
    // Implementation
  }
  
  async load(): Promise<string | null> {
    // Implementation
    return null;
  }
}
```

### Example: Creating a Middleware Function

```typescript
import { MiddlewareFunction, MiddlewareContext } from 'run-cache';

const loggingMiddleware: MiddlewareFunction = async (value, context, next) => {
  console.log(`${context.operation} operation for key: ${context.key}`);
  return next(value);
};

RunCache.use(loggingMiddleware);
```

### Example: Handling Events with Types

```typescript
import { RunCache, EVENT, ExpiryEvent, RefetchEvent } from 'run-cache';

const handleExpiry = (event: ExpiryEvent) => {
  console.log(`Cache key ${event.key} expired`);
};

const handleRefetch = (event: RefetchEvent) => {
  console.log(`Cache key ${event.key} was refreshed`);
};

RunCache.onExpiry(handleExpiry);
RunCache.onRefetch(handleRefetch);

// Later, remove specific handlers
RunCache.clearEventListeners({
  event: EVENT.EXPIRE,
  handler: handleExpiry
});
```

## Type Compatibility

RunCache is compatible with TypeScript 4.0 and above. The library uses modern TypeScript features like:

- Discriminated unions
- Generic types
- Function types
- Interface inheritance
- Optional properties
- Readonly properties

## Next Steps

- [RunCache API](./run-cache.md) - Learn about the main RunCache API
- [Events](./events.md) - Understand the event system
- [Storage Adapters](./storage-adapters.md) - Learn about persistent storage options 