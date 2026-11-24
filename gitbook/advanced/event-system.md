# Event System

RunCache provides a comprehensive event system that allows you to monitor and respond to various cache lifecycle events. This guide explains how to use the event system effectively in your applications.

## Understanding the Event System

The event system allows you to:
- Monitor cache operations like expiration, refetching, and invalidation
- Execute custom logic when specific events occur
- Implement logging, analytics, and debugging
- Build reactive systems that respond to cache changes

RunCache supports both global event listeners (for all keys) and key-specific listeners (for specific keys or patterns).

Listeners run synchronously, in the order they were registered. Errors thrown by a listener are reported to `console.error` and do not affect other listeners or the cache operation (see [Handle Errors in Event Handlers](#2-handle-errors-in-event-handlers)).

## Available Event Types

RunCache provides several event types you can subscribe to:

| Event Type | Description | Event Object Properties |
|------------|-------------|------------------------|
| `EXPIRE` | Triggered when a cache entry expires | `key`, `value`, `ttl`, `createdAt`, `updatedAt` |
| `REFETCH` | Triggered when a cache entry is refreshed | `key`, `value`, `ttl`, `createdAt`, `updatedAt` |
| `REFETCH_FAILURE` | Triggered when a cache refresh fails | `key`, `value`, `ttl`, `createdAt`, `updatedAt` |
| `TAG_INVALIDATION` | Triggered when a cache entry is invalidated by tag | the above, plus `tag` |
| `DEPENDENCY_INVALIDATION` | Triggered when a cache entry is invalidated by dependency | the above, plus `dependencyKey` |

`value` is the stored form of the entry: non-string values arrive as their JSON string. No event carries an error object or custom metadata.

## Global Event Listeners

Global event listeners are triggered for all cache entries that match the specified event type:

### Expiry Events

```typescript
// Listen for all expiry events
await RunCache.onExpiry((event) => {
  console.log(`Cache key ${event.key} expired at ${new Date(event.updatedAt + event.ttl).toISOString()}`);
});
```

### Refetch Events

```typescript
// Listen for all successful refetch events
await RunCache.onRefetch((event) => {
  console.log(`Cache key ${event.key} was refreshed at ${new Date().toISOString()}`);
});

// Listen for all refetch failure events
await RunCache.onRefetchFailure((event) => {
  console.error(`Failed to refresh cache key ${event.key}:`, event.error);
});
```

### Tag Invalidation Events

```typescript
// Listen for all tag invalidation events
await RunCache.onTagInvalidation((event) => {
  console.log(`Cache key ${event.key} was invalidated by tag: ${event.tag}`);
});
```

### Dependency Invalidation Events

```typescript
// Listen for all dependency invalidation events
await RunCache.onDependencyInvalidation((event) => {
  console.log(`Cache key ${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

## Key-Specific Event Listeners

Key-specific event listeners are triggered only for cache entries with keys that match the specified key or pattern:

### Key-Specific Expiry Events

```typescript
// Listen for expiry of a specific key
await RunCache.onKeyExpiry("api-data", (event) => {
  console.log(`API data cache expired`);
});

// Listen for expiry of keys matching a pattern
await RunCache.onKeyExpiry("user:*:profile", (event) => {
  console.log(`User profile ${event.key} expired`);
});
```

### Key-Specific Refetch Events

```typescript
// Listen for refetch of a specific key
await RunCache.onKeyRefetch("weather-data", (event) => {
  console.log(`Weather data was refreshed`);
});

// Listen for refetch failures of keys matching a pattern
await RunCache.onKeyRefetchFailure("api:*", (event) => {
  console.error(`API data ${event.key} refresh failed:`, event.error);
});
```

### Key-Specific Tag Invalidation Events

```typescript
// Listen for tag invalidation of keys matching a pattern
await RunCache.onKeyTagInvalidation("user:*:profile", (event) => {
  console.log(`User profile ${event.key} was invalidated by tag: ${event.tag}`);
});
```

### Key-Specific Dependency Invalidation Events

```typescript
// Listen for dependency invalidation of a specific key
await RunCache.onKeyDependencyInvalidation("dashboard:main", (event) => {
  console.log(`Main dashboard was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

## Managing Event Listeners

### Removing All Event Listeners

To remove all event listeners:

```typescript
// Remove all event listeners
await RunCache.clearEventListeners();
```

### Removing Specific Event Listeners

To remove listeners for a specific event type:

```typescript
// Remove all expiry event listeners
await RunCache.clearEventListeners({
  event: EVENT.EXPIRE
});
```

### Removing Key-Specific Listeners

To remove listeners for a specific key or pattern:

```typescript
// Remove refetch listeners for a specific key
await RunCache.clearEventListeners({
  event: EVENT.REFETCH,
  key: "api-data"
});

// Remove refetch failure listeners for keys matching a pattern
await RunCache.clearEventListeners({
  event: EVENT.REFETCH_FAILURE,
  key: "api:*"
});
```

## Practical Event System Use Cases

### 1. Logging and Monitoring

Use events to implement comprehensive logging:

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

Use events to implement retry logic for failed refetches:

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

Use events to trigger UI updates when cache data changes:

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

Use events to collect analytics about cache usage:

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

### 5. Cascading Updates

Use events to implement custom cascading update logic:

```typescript
// When user data is refreshed, also refresh related data
await RunCache.onKeyRefetch('user:*:profile', async (event) => {
  const userId = event.key.split(':')[1];

  // Refresh related data
  await RunCache.refetch(`user:${userId}:recommendations`);
  await RunCache.refetch(`user:${userId}:activity`);
});
```

## Event Metadata

Cache entries cannot carry custom metadata, and event objects only contain the fields listed in the [Events API](../api/events.md). To associate extra information with a key, keep it in your own map:

```typescript
const entryInfo = new Map<string, { source: string; version: string }>();

await RunCache.set({ key: 'api-data', value: { results: [] } });
entryInfo.set('api-data', { source: 'external-api', version: '1.0' });

await RunCache.onKeyExpiry('api-data', (event) => {
  const info = entryInfo.get(event.key);
  console.log(`API data expired. Source: ${info?.source}, Version: ${info?.version}`);
});
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

### 5. Avoid Circular Event Handling

Be careful not to create circular event handling patterns:

```typescript
// Dangerous - potential circular handling
await RunCache.onKeyRefetch('data-a', async () => {
  await RunCache.refetch('data-b');
});

await RunCache.onKeyRefetch('data-b', async () => {
  await RunCache.refetch('data-a'); // Creates a loop!
});
```

## Next Steps

Now that you understand the event system, explore these related topics:

- [Tag-based Invalidation](./tag-invalidation.md) - Learn about invalidating groups of related cache entries
- [Dependency Tracking](./dependency-tracking.md) - Understand how to establish relationships between cache entries
- [Middleware](./middleware.md) - Explore how to intercept and transform cache operations
- [Resource Management](./resource-management.md) - Learn about memory management and cleanup 