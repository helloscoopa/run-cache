# Events API Reference

RunCache provides a comprehensive event system that allows you to monitor and respond to various cache lifecycle events. This page provides a complete reference for all event types, event objects, and event handling methods.

## Event Types

RunCache defines several event types in the `EVENT` enum:

```typescript
enum EVENT {
  EXPIRE = 'expire',
  REFETCH = 'refetch',
  REFETCH_FAILURE = 'refetch_failure',
  TAG_INVALIDATION = 'tag_invalidation',
  DEPENDENCY_INVALIDATION = 'dependency_invalidation'
}
```

Import the enum from the RunCache package:

```typescript
import { RunCache, EVENT } from 'run-cache';
```

## Event Objects

Every listener receives an object of the exported `EventParam` type. The interfaces below describe which fields are set for each event; they are not exported under these names.

### ExpiryEvent

Triggered when a cache entry expires.

```typescript
interface ExpiryEvent {
  key: string;        // The key of the expired entry
  value: string;      // The stored value at the time it expired (after middleware)
  ttl: number;        // The TTL value in milliseconds
  createdAt: number;  // Timestamp when the entry was created
  updatedAt: number;  // Timestamp when the entry was last updated
}
```

An expiry is reported exactly once per version of an entry. The event fires when the TTL timer elapses, or earlier if a `get()` or `has()` call notices the expiry first; it is never repeated for the same expiry. Each time an auto-refetched entry is refreshed it gets a new version, so its next expiry is reported again. An entry that is overwritten or deleted before its TTL elapses does not emit an expiry event.

`value` is the stored string. For entries cached from non-string values (for example through a typed cache), it is the serialized form.

### RefetchEvent

Triggered when a cache entry is refreshed.

```typescript
interface RefetchEvent {
  key: string;        // The key of the refreshed entry
  value: string;      // The value returned by the source function
  ttl?: number;       // The entry's TTL in milliseconds, if it has one
  createdAt: number;  // Timestamp of the refetch
  updatedAt: number;  // Timestamp of the refetch
}
```

### RefetchFailureEvent

Triggered when a cache refresh operation fails.

```typescript
interface RefetchFailureEvent {
  key: string;        // The key of the entry that failed to refresh
  value: string;      // The value still in the cache (the last successful one)
  ttl?: number;       // The entry's TTL in milliseconds, if it has one
  createdAt: number;  // Timestamp when the entry was created
  updatedAt: number;  // Timestamp of the last successful update
  error: unknown;     // The error thrown by the source function
}
```

`error` is exactly what the source function threw or rejected with, so you can inspect its type, status code or message. If the source function resolved to `undefined`, `error` is a `SourceFnError` describing that.

### TagInvalidationEvent

Triggered when a cache entry is invalidated by tag.

```typescript
interface TagInvalidationEvent {
  key: string;        // The key of the invalidated entry
  value: string;      // The value the entry held
  ttl?: number;       // The entry's TTL in milliseconds, if it had one
  createdAt: number;  // Timestamp when the entry was created
  updatedAt: number;  // Timestamp when the entry was last updated
  tag: string;        // The tag that caused the invalidation
}
```

### DependencyInvalidationEvent

Triggered when a cache entry is invalidated due to a dependency.

```typescript
interface DependencyInvalidationEvent {
  key: string;        // The key of the invalidated entry
  value: string;      // The value the entry held
  ttl?: number;       // The entry's TTL in milliseconds, if it had one
  createdAt: number;  // Timestamp when the entry was created
  updatedAt: number;  // Timestamp when the entry was last updated
  dependencyKey: string; // The key of the dependency that caused the invalidation
}
```

## Global Event Listeners

Global event listeners are triggered for all cache entries that match the specified event type.

### onExpiry

Registers a callback for all expiry events.

```typescript
await RunCache.onExpiry(callback: (event: ExpiryEvent) => void): Promise<void>
```

**Parameters:**
- `callback`: Function to call when any entry expires

**Example:**

```typescript
await RunCache.onExpiry((event) => {
  console.log(`Cache key ${event.key} expired at ${new Date(event.updatedAt + event.ttl).toISOString()}`);
});
```

### onRefetch

Registers a callback for all refetch events.

```typescript
await RunCache.onRefetch(callback: (event: RefetchEvent) => void): Promise<void>
```

**Parameters:**
- `callback`: Function to call when any entry is refreshed

**Example:**

```typescript
await RunCache.onRefetch((event) => {
  console.log(`Cache key ${event.key} was refreshed at ${new Date().toISOString()}`);
});
```

### onRefetchFailure

Registers a callback for all refetch failure events.

```typescript
await RunCache.onRefetchFailure(callback: (event: RefetchFailureEvent) => void): Promise<void>
```

**Parameters:**
- `callback`: Function to call when any refresh fails

**Example:**

```typescript
await RunCache.onRefetchFailure((event) => {
  console.error(`Failed to refresh cache key ${event.key}:`, event.error);
});
```

### onTagInvalidation

Registers a callback for all tag invalidation events.

```typescript
await RunCache.onTagInvalidation(callback: (event: TagInvalidationEvent) => void): Promise<void>
```

**Parameters:**
- `callback`: Function to call when any entry is invalidated by tag

**Example:**

```typescript
await RunCache.onTagInvalidation((event) => {
  console.log(`Cache key ${event.key} was invalidated by tag: ${event.tag}`);
});
```

### onDependencyInvalidation

Registers a callback for all dependency invalidation events.

```typescript
await RunCache.onDependencyInvalidation(callback: (event: DependencyInvalidationEvent) => void): Promise<void>
```

**Parameters:**
- `callback`: Function to call when any entry is invalidated by dependency

**Example:**

```typescript
await RunCache.onDependencyInvalidation((event) => {
  console.log(`Cache key ${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

## Key-Specific Event Listeners

Key-specific event listeners are triggered only for cache entries with keys that match the specified key or pattern.

### onKeyExpiry

Registers a callback for expiry events for a specific key or pattern.

```typescript
await RunCache.onKeyExpiry(key: string, callback: (event: ExpiryEvent) => void): Promise<void>
```

**Parameters:**
- `key`: The key or pattern to watch
- `callback`: Function to call when matching entries expire

**Example:**

```typescript
// Specific key
await RunCache.onKeyExpiry("api-data", (event) => {
  console.log(`API data cache expired`);
});

// Pattern matching
await RunCache.onKeyExpiry("user:*:profile", (event) => {
  console.log(`User profile ${event.key} expired`);
});
```

### onKeyRefetch

Registers a callback for refetch events for a specific key or pattern.

```typescript
await RunCache.onKeyRefetch(key: string, callback: (event: RefetchEvent) => void): Promise<void>
```

**Parameters:**
- `key`: The key or pattern to watch
- `callback`: Function to call when matching entries are refreshed

**Example:**

```typescript
// Specific key
await RunCache.onKeyRefetch("weather-data", (event) => {
  console.log(`Weather data was refreshed`);
});

// Pattern matching
await RunCache.onKeyRefetch("api:*:data", (event) => {
  console.log(`API data ${event.key} was refreshed`);
});
```

### onKeyRefetchFailure

Registers a callback for refetch failure events for a specific key or pattern.

```typescript
await RunCache.onKeyRefetchFailure(key: string, callback: (event: RefetchFailureEvent) => void): Promise<void>
```

**Parameters:**
- `key`: The key or pattern to watch
- `callback`: Function to call when matching refreshes fail

**Example:**

```typescript
// Specific key
await RunCache.onKeyRefetchFailure("api-data", (event) => {
  console.error(`API data refresh failed:`, event.error);
});

// Pattern matching
await RunCache.onKeyRefetchFailure("api:*", (event) => {
  console.error(`API data ${event.key} refresh failed:`, event.error);
});
```

### onKeyTagInvalidation

Registers a callback for tag invalidation events for a specific key or pattern.

```typescript
await RunCache.onKeyTagInvalidation(key: string, callback: (event: TagInvalidationEvent) => void): Promise<void>
```

**Parameters:**
- `key`: The key or pattern to watch
- `callback`: Function to call when matching entries are invalidated by tag

**Example:**

```typescript
// Specific key
await RunCache.onKeyTagInvalidation("user:1:profile", (event) => {
  console.log(`User profile was invalidated by tag: ${event.tag}`);
});

// Pattern matching
await RunCache.onKeyTagInvalidation("user:*:profile", (event) => {
  console.log(`User profile ${event.key} was invalidated by tag: ${event.tag}`);
});
```

### onKeyDependencyInvalidation

Registers a callback for dependency invalidation events for a specific key or pattern.

```typescript
await RunCache.onKeyDependencyInvalidation(key: string, callback: (event: DependencyInvalidationEvent) => void): Promise<void>
```

**Parameters:**
- `key`: The key or pattern to watch
- `callback`: Function to call when matching entries are invalidated by dependency

**Example:**

```typescript
// Specific key
await RunCache.onKeyDependencyInvalidation("dashboard:main", (event) => {
  console.log(`Main dashboard was invalidated due to dependency on: ${event.dependencyKey}`);
});

// Pattern matching
await RunCache.onKeyDependencyInvalidation("dashboard:*", (event) => {
  console.log(`Dashboard ${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

## Managing Event Listeners

### clearEventListeners

Removes event listeners based on the specified options.

```typescript
await RunCache.clearEventListeners(options?: {
  event?: EventName;
  key?: string;
}): Promise<boolean>
```

**Parameters:**
- `options?`: Options to specify which listeners to remove
  - `event?`: The event type to remove listeners for. Only that exact event is affected: clearing `EVENT.REFETCH` leaves `EVENT.REFETCH_FAILURE` listeners in place.
  - `key?`: The key or wildcard pattern to remove listeners for. Without `event`, the key's listeners are removed for every event type.

With no options, every listener is removed. An options object that selects nothing, such as `{}` or `{ event: undefined }`, removes nothing and returns `false`.

An exact key only clears listeners registered for that exact key. Wildcard listeners that match it, such as `api-*` for `api-data`, stay registered; clear them by passing the pattern itself.

**Returns:** `Promise<boolean>` - `true` if at least one listener was removed, `false` if there was nothing to remove.

**Examples:**

```typescript
// Remove all event listeners
await RunCache.clearEventListeners();

// Remove all expiry event listeners
await RunCache.clearEventListeners({
  event: EVENT.EXPIRE
});

// Remove all listeners for a specific key
await RunCache.clearEventListeners({
  key: "api-data"
});

// Remove specific event listeners for a key
await RunCache.clearEventListeners({
  event: EVENT.REFETCH,
  key: "api-data"
});

// Check whether anything was removed
const removed = await RunCache.clearEventListeners({ event: EVENT.EXPIRE });
```

Removing a single handler is not supported; clear the event (and key) it was registered for and register the remaining handlers again.

## Event Metadata

Cache entries cannot carry custom metadata, and event objects only contain the fields listed in the [Events API](events.md). To associate extra information with a key, keep it in your own map:

```typescript
const entryInfo = new Map<string, { source: string; version: string }>();

await RunCache.set({ key: 'api-data', value: { results: [] } });
entryInfo.set('api-data', { source: 'external-api', version: '1.0' });

await RunCache.onKeyExpiry('api-data', (event) => {
  const info = entryInfo.get(event.key);
  console.log(`API data expired. Source: ${info?.source}, Version: ${info?.version}`);
});
```

## Practical Event System Use Cases

### 1. Logging and Monitoring

```typescript
// Set up logging for all major events
await RunCache.onExpiry((event) => {
  logger.info(`Cache expired: ${event.key}`);
});

await RunCache.onRefetch((event) => {
  logger.info(`Cache refreshed: ${event.key}`);
});

await RunCache.onRefetchFailure((event) => {
  logger.error(`Cache refresh failed: ${event.key}`, event.error);
});

await RunCache.onTagInvalidation((event) => {
  logger.info(`Cache invalidated by tag: ${event.key} (tag: ${event.tag})`);
});

await RunCache.onDependencyInvalidation((event) => {
  logger.info(`Cache invalidated by dependency: ${event.key} (depends on: ${event.dependencyKey})`);
});
```

### 2. Implementing Retry Logic

```typescript
// Set up retry logic with exponential backoff
// Attempts per key; RunCache events carry no custom metadata
const retryCounts = new Map<string, number>();

await RunCache.onRefetchFailure((event) => {
  const retryCount = (retryCounts.get(event.key) ?? 0) + 1;
  retryCounts.set(event.key, retryCount);

  if (retryCount <= 3) {
    const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
    console.log(`Retrying ${event.key} in ${delay}ms (attempt ${retryCount})`);

    setTimeout(() => {
      RunCache.refetch(event.key)
        .then((ok) => { if (ok) retryCounts.delete(event.key); })
        .catch(() => { /* reported again through onRefetchFailure */ });
    }, delay);
  } else {
    console.error(`Failed to refresh ${event.key} after ${retryCount} attempts`);
  }
});
```

### 3. UI Updates

```typescript
// React component example
function UserProfile({ userId }) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const key = `user:${userId}:profile`;

    // get() returns the stored object, no parsing needed
    const load = async () => {
      const data = await RunCache.get(key);
      if (data !== undefined) setProfile(data);
    };

    // Register the listener, then do the initial load
    const ready = RunCache.onKeyRefetch(key, load).then(load);

    // Clean up on unmount, once the listener has been registered
    return () => {
      ready.then(() => RunCache.clearEventListeners({ event: EVENT.REFETCH, key }));
    };
  }, [userId]);

  // Render profile...
}
```

### 4. Cache Analytics

```typescript
// Set up analytics tracking
let metrics = {
  expiryCount: 0,
  refetchCount: 0,
  refetchFailureCount: 0,
  tagInvalidationCount: 0,
  dependencyInvalidationCount: 0
};

await RunCache.onExpiry(() => metrics.expiryCount++);
await RunCache.onRefetch(() => metrics.refetchCount++);
await RunCache.onRefetchFailure(() => metrics.refetchFailureCount++);
await RunCache.onTagInvalidation(() => metrics.tagInvalidationCount++);
await RunCache.onDependencyInvalidation(() => metrics.dependencyInvalidationCount++);

// Report metrics periodically
setInterval(() => {
  console.log('Cache metrics:', metrics);
  // Send metrics to monitoring system
  sendMetricsToMonitoring(metrics);

  // Reset counters
  metrics = {
    expiryCount: 0,
    refetchCount: 0,
    refetchFailureCount: 0,
    tagInvalidationCount: 0,
    dependencyInvalidationCount: 0
  };
}, 60000); // Every minute
```

## Best Practices for Event Handling

### 1. Keep Event Handlers Lightweight

Event handlers should be fast and non-blocking:

```typescript
// Good - lightweight handler
await RunCache.onExpiry((event) => {
  console.log(`Cache expired: ${event.key}`);
});

// Avoid - heavy processing in handler
await RunCache.onExpiry(async (event) => {
  // DON'T do this - blocks the event loop
  await heavyProcessing();
  await networkRequest();
});
```

If you need to perform heavy work, delegate it to a separate process or queue.

### 2. Handle Errors in Event Handlers

RunCache isolates listeners from cache operations. If a listener throws, or an `async` listener rejects, the error is written to `console.error` (naming the event and key), the remaining listeners still run, and the cache operation that emitted the event completes normally. A failing listener can therefore never abort an invalidation, crash the process from an expiry timer, or cause an unhandled promise rejection. The error is not passed back to the code that triggered the event. To route listener errors to your own logging instead of the console, set `onListenerError`:

```typescript
await RunCache.configure({
  onListenerError: (error, { event, key }) => logger.error({ err: error, event, key }, 'RunCache listener failed'),
});
```

To react to errors inside a specific listener, handle them there:

```typescript
// Good - error handling
await RunCache.onRefetch((event) => {
  try {
    processRefetchEvent(event);
  } catch (error) {
    console.error('Error in refetch handler:', error);
  }
});
```

### 3. Use Specific Key Patterns

Use specific key patterns to minimize unnecessary event processing:

```typescript
// Too broad - triggers for all keys
await RunCache.onKeyExpiry('*', (event) => {
  // This will run for EVERY expiry
});

// Better - more specific pattern
await RunCache.onKeyExpiry('api:*', (event) => {
  // This will only run for API-related expirations
});
```

### 4. Clean Up Event Listeners

Remove event listeners when they're no longer needed:

```typescript
// In a component or module initialization
async function initializeModule() {
  // Set up event listeners
  await RunCache.onKeyRefetch('module-data', handleRefetch);

  // Return cleanup function
  return () =>
    RunCache.clearEventListeners({
      event: EVENT.REFETCH,
      key: 'module-data'
    });
}

// Later, when shutting down
const cleanup = await initializeModule();
// When module is unloaded
await cleanup();
```

## Next Steps

- [RunCache API](./run-cache.md) - Learn about the main RunCache API
- [Storage Adapters](./storage-adapters.md) - Understand persistent storage options
- [Types](./types.md) - Explore TypeScript type definitions
- [Event System](../advanced/event-system.md) - Learn more about using events in your application 