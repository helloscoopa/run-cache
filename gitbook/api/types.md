# TypeScript Types

This page lists every type the `run-cache` package exports. Import them with `import type`:

```typescript
import type {
  CacheConfig,
  EventParam,
  EventName,
  MiddlewareFunction,
  MiddlewareContext,
  StorageAdapter,
  StorageAdapterConfig
} from 'run-cache';
```

The values `RunCache` (also the default export), `EvictionPolicy`, `EVENT`, `LocalStorageAdapter`, `IndexedDBAdapter`, `FilesystemAdapter` and the [error classes](#error-classes) are exported too. Nothing else is part of the public API.

## CacheConfig

Options for `RunCache.configure()`. Every option is optional, and a call only changes the options it passes.

```typescript
interface CacheConfig {
  /** Maximum number of entries. Default: unlimited */
  maxEntries?: number;

  /** Declared but not used: entries without a ttl never expire */
  defaultTTL?: number;

  /** What to evict when maxEntries is reached. Default: EvictionPolicy.NONE */
  evictionPolicy?: EvictionPolicy;

  /** Adapter to persist the cache with. Attaching one loads its saved data */
  storageAdapter?: StorageAdapter;

  /** Log operations and errors to the console. Default: false */
  debug?: boolean;

  /** Call shutdown() on SIGINT/SIGTERM (Node.js) or beforeunload (browser). Default: false */
  handleProcessSignals?: boolean;

  /** Receives errors thrown by event listeners. Default: console.error */
  onListenerError?: (error: unknown, context: { event: string; key: string }) => void;
}
```

## Set options

`RunCache.set()` takes an inline options object; there is no exported name for it:

```typescript
{
  key: string;              // must not be empty
  value?: T;                // strings (including '') are stored as-is, other values as JSON
  ttl?: number;             // milliseconds; must not be negative
  autoRefetch?: boolean;    // requires ttl, and a sourceFn to have any effect
  sourceFn?: () => T | Promise<T>;
  tags?: string[];
  dependencies?: string[];
}
```

One of `value` or `sourceFn` is required. If you need the type, derive it: `Parameters<typeof RunCache.set>[0]`.

## Event Types

### EVENT

```typescript
const EVENT = {
  EXPIRE: 'expire',
  REFETCH: 'refetch',
  REFETCH_FAILURE: 'refetch_failure',
  TAG_INVALIDATION: 'tag_invalidation',
  DEPENDENCY_INVALIDATION: 'dependency_invalidation',
} as const;
```

### EventName

```typescript
type EventName = keyof typeof EVENT
  | 'expire' | 'refetch' | 'refetch_failure' | 'tag_invalidation' | 'dependency_invalidation';
```

Accepted by `RunCache.clearEventListeners({ event })`.

### EventParam

Every event listener receives an `EventParam`:

```typescript
type EventParam<T = string> = {
  key: string;
  value: T;               // see the note below
  serializedValue?: string;
  ttl?: number;
  createdAt: number;      // ms since epoch
  updatedAt: number;
  tag?: string;           // tag_invalidation events only
  dependencyKey?: string; // dependency_invalidation events only
  error?: unknown;        // refetch_failure events only
};
```

`value` holds the entry's stored form: a string set as a string is passed unchanged, but any other value is passed as its JSON string, even when a typed cache declares `T`. `error` is set on `refetch_failure` events to what the source function threw (or a `SourceFnError` if it resolved to `undefined`). See [Events](events.md).

## Middleware Types

### MiddlewareFunction

```typescript
type MiddlewareFunction<T = string> = (
  value: T,
  context: MiddlewareContext<T>,
  next: (nextValue: T) => Promise<T>
) => Promise<T>;
```

`RunCache.use()` takes a `MiddlewareFunction<string | undefined>`: middleware always sees the stored string, never the original object.

### MiddlewareContext

```typescript
interface MiddlewareContext<T = string> {
  key: string;
  operation: 'get' | 'set' | 'delete' | 'has' | 'refetch';
  value?: T;
  serializedValue?: string;
  ttl?: number;
  autoRefetch?: boolean;
  timestamp: number;
}
```

Although the type lists `delete` and `has`, middleware only runs for `set`, `refetch`, and `get` when the key is found. See [Middleware](../advanced/middleware.md).

## Storage Types

### StorageAdapter

```typescript
interface StorageAdapter {
  save(data: string): Promise<void>;
  load(): Promise<string | null>;

  /**
   * Remove the stored cache data
   */
  clear(): Promise<void>;

  /**
   * Optional auto-save interval in milliseconds, applied when the adapter is attached
   */
  readonly autoSaveInterval?: number;

  /**
   * Optional: whether existing data is loaded when the adapter is attached (default: true)
   */
  readonly autoLoadOnInit?: boolean;
}
```

Implement it to persist the cache somewhere other than the built-in adapters. See [Persistent Storage](../advanced/persistent-storage.md#custom-storage-adapters).

### StorageAdapterConfig

```typescript
interface StorageAdapterConfig {
  /** Key (or file name, for FilesystemAdapter) to store under. Default: "run-cache-data" */
  storageKey?: string;
  /** Save at this interval (ms) while the adapter is attached. Default: 0 (off) */
  autoSaveInterval?: number;
  /** Load existing data when the adapter is attached. Default: true */
  autoLoadOnInit?: boolean;
}
```

The adapter constructors take `Partial<StorageAdapterConfig>`; `FilesystemAdapter` additionally accepts `filePath?: string`.

## Error Classes

```typescript
import { RunCacheError, SourceFnError, MiddlewareError } from 'run-cache';
```

| Class | Thrown when | Extends |
| --- | --- | --- |
| `RunCacheError` | Base class for the errors below | `Error` |
| `SourceFnError` | A source function throws, rejects or resolves to `undefined` | `RunCacheError` |
| `MiddlewareError` | A middleware function throws or produces `undefined` | `RunCacheError` |

Each has `key` (the cache key of the failing operation) and, when there is an underlying error, `cause`:

```typescript
import { RunCache, SourceFnError } from 'run-cache';

try {
  await RunCache.refetch('api-data');
} catch (error) {
  if (error instanceof SourceFnError) {
    console.error(`Refetch of ${error.key} failed`, error.cause);
  }
}
```

## EvictionPolicy

```typescript
enum EvictionPolicy {
  NONE = 'NONE', // never evict (default)
  LRU = 'LRU',   // evict the least recently used entry
  LFU = 'LFU',   // evict the least frequently used entry
}
```

## Examples

### Configuration

```typescript
import { RunCache, EvictionPolicy, type CacheConfig } from 'run-cache';

const config: CacheConfig = {
  maxEntries: 1000,
  evictionPolicy: EvictionPolicy.LRU,
  debug: process.env.NODE_ENV !== 'production'
};

await RunCache.configure(config);
```

### Middleware

```typescript
import { RunCache, type MiddlewareFunction } from 'run-cache';

const logOperations: MiddlewareFunction<string | undefined> = async (value, context, next) => {
  console.log(`${context.operation} ${context.key}`);
  return next(value);
};

await RunCache.use(logOperations);
```

### Event handler

```typescript
import { RunCache, type EventParam } from 'run-cache';

function logExpiry(event: EventParam) {
  console.log(`${event.key} expired after ${event.ttl}ms`);
}

await RunCache.onExpiry(logExpiry);
```

## Next Steps

- [RunCache API](run-cache.md) - Method reference
- [Events](events.md) - Event reference
- [Typed Cache Interface](typed-cache-interface.md) - `createTypedCache<T>()`
