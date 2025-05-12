# Resource Management

RunCache provides several features to help you effectively manage memory usage and ensure proper cleanup of resources. This guide explains how to optimize resource usage and implement proper cleanup in your applications.

## Understanding Resource Management

Effective resource management in RunCache involves:
- Controlling memory usage through cache size limits
- Implementing appropriate eviction policies
- Ensuring proper cleanup of timers and event listeners
- Managing application lifecycle events
- Optimizing cache performance

## Cache Size Management

### Setting Maximum Cache Size

You can limit the maximum number of entries in the cache using the `maxSize` configuration option:

```typescript
import { RunCache, EvictionPolicy } from 'run-cache';

// Configure cache with a maximum size of 1000 entries
RunCache.configure({
  maxSize: 1000,
  evictionPolicy: EvictionPolicy.LRU // Least Recently Used
});
```

When the cache reaches the maximum size, the configured eviction policy determines which entries are removed to make space for new ones.

### Available Eviction Policies

RunCache supports three eviction policies:

1. **NONE**: No automatic eviction (default). Cache entries are only removed via TTL or manual deletion.

2. **LRU (Least Recently Used)**: Removes the least recently accessed entries when the cache exceeds its maximum size. This is ideal for most applications as it preserves frequently accessed data.

3. **LFU (Least Frequently Used)**: Removes the least frequently accessed entries when the cache exceeds its maximum size. When entries have the same access frequency, the oldest entry is removed first. This is useful for applications where access frequency is more important than recency.

```typescript
// Configure with LRU policy
RunCache.configure({
  maxSize: 1000,
  evictionPolicy: EvictionPolicy.LRU
});

// Configure with LFU policy
RunCache.configure({
  maxSize: 1000,
  evictionPolicy: EvictionPolicy.LFU
});
```

### Monitoring Evictions

You can monitor evictions by setting up a custom middleware:

```typescript
// Add middleware to track evictions
RunCache.use(async (value, context, next) => {
  if (context.operation === 'evict') {
    console.log(`Cache entry ${context.key} was evicted due to size limits`);
    // Track metrics about evictions
    trackMetric('cache.eviction', {
      key: context.key,
      policy: RunCache.getConfig().evictionPolicy
    });
  }
  return next(value);
});
```

## Memory Usage Optimization

### Using TTL for Automatic Cleanup

Set appropriate TTL (Time-to-Live) values to automatically remove entries that are no longer needed:

```typescript
// Set cache entry with TTL
await RunCache.set({
  key: 'temporary-data',
  value: JSON.stringify(largeDataObject),
  ttl: 3600000 // 1 hour
});
```

### Manual Cleanup

For immediate cleanup of specific entries or groups of entries:

```typescript
// Delete specific entries
RunCache.delete('large-data-key');

// Delete groups of entries using patterns
RunCache.delete('temp:*');

// Clear the entire cache
RunCache.flush();
```

### Optimizing Value Size

Minimize the size of cached values:

```typescript
// Bad - storing unnecessary data
await RunCache.set({
  key: 'user-profile',
  value: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
    avatar: largeBase64EncodedImage, // Unnecessarily large
    fullHistory: completeUserHistory, // Rarely needed data
    // ...more data
  })
});

// Better - store only what's needed
await RunCache.set({
  key: 'user-profile',
  value: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
    avatarUrl: '/avatars/john.jpg', // Just the URL, not the image
    // ...essential data only
  })
});

// Store rarely needed data separately
await RunCache.set({
  key: 'user-profile:full-history',
  value: JSON.stringify(completeUserHistory),
  ttl: 3600000 // With shorter TTL
});
```

## Timer Management

RunCache uses timers for TTL expiration and automatic refetching. These are managed automatically, but it's important to understand how they work.

### How Timers Work in RunCache

- **TTL Timers**: RunCache uses lazy expiration, checking if entries have expired only when they're accessed. This avoids the overhead of maintaining timers for every entry.

- **Refetch Timers**: For entries with `autoRefetch: true`, RunCache sets up timers to trigger background refreshes when the TTL expires.

### Cleaning Up Timers

When you delete a cache entry or flush the cache, RunCache automatically cleans up any associated timers:

```typescript
// This automatically cleans up any timers for this entry
RunCache.delete('api-data');

// This cleans up all timers for all entries
RunCache.flush();
```

## Event Listener Management

As your application grows, you might accumulate many event listeners. It's important to clean them up when they're no longer needed.

### Removing Event Listeners

```typescript
// Remove all event listeners
RunCache.clearEventListeners();

// Remove listeners for a specific event type
RunCache.clearEventListeners({
  event: EVENT.EXPIRE
});

// Remove listeners for a specific key
RunCache.clearEventListeners({
  event: EVENT.REFETCH,
  key: 'api-data'
});
```

### Best Practices for Event Listeners

```typescript
// In a component or module
function initializeComponent() {
  // Set up event listeners
  RunCache.onKeyRefetch('component-data', handleRefetch);
  
  // Return cleanup function
  return () => {
    RunCache.clearEventListeners({
      event: EVENT.REFETCH,
      key: 'component-data'
    });
  };
}

// When component mounts
const cleanup = initializeComponent();

// When component unmounts
cleanup();
```

## Middleware Management

Middleware functions can accumulate over time and impact performance. Clean them up when they're no longer needed:

```typescript
// Remove all middleware
RunCache.clearMiddleware();
```

## Application Lifecycle Management

### Automatic Cleanup on Termination

RunCache automatically registers handlers for SIGTERM and SIGINT signals in Node.js environments to ensure proper cleanup when the application is shutting down:

```typescript
// This happens automatically in Node.js environments
// RunCache registers handlers for:
// - process.on('SIGTERM', ...)
// - process.on('SIGINT', ...)
```

These handlers perform a complete shutdown of RunCache, cleaning up all resources.

### Manual Shutdown

You can also manually trigger a complete shutdown of RunCache:

```typescript
// Manually shut down the cache
RunCache.shutdown();
```

The `shutdown` method:
1. Clears all cache entries
2. Cancels all timers
3. Removes all event listeners
4. Resets the cache configuration to default values

This is particularly useful in long-running applications or when you need to release resources manually.

## Persistent Storage Management

When using persistent storage adapters, it's important to manage storage resources effectively:

```typescript
import { RunCache, FilesystemAdapter } from 'run-cache';

// Configure with storage adapter
RunCache.configure({
  storageAdapter: new FilesystemAdapter({
    storageKey: 'my-app-cache',
    autoSaveInterval: 300000 // Save every 5 minutes
  })
});

// Manual save
await RunCache.saveToStorage();

// Manual load
await RunCache.loadFromStorage();

// Disable auto-save
RunCache.setupAutoSave(0);
```

### Storage Cleanup

To clean up persistent storage:

```typescript
// Clear cache and save empty state to storage
RunCache.flush();
await RunCache.saveToStorage();
```

## Performance Optimization Strategies

### 1. Use Appropriate TTL Values

Match TTL values to data volatility:

```typescript
// Frequently changing data
await RunCache.set({
  key: 'stock-prices',
  value: JSON.stringify(prices),
  ttl: 60000 // 1 minute
});

// Relatively stable data
await RunCache.set({
  key: 'product-catalog',
  value: JSON.stringify(catalog),
  ttl: 3600000 // 1 hour
});

// Very stable data
await RunCache.set({
  key: 'app-configuration',
  value: JSON.stringify(config),
  ttl: 86400000 // 1 day
});
```

### 2. Implement Staggered Expiration

Add small random variations to TTL to prevent mass expiration:

```typescript
function setWithJitter(key, value, baseTTL) {
  const jitter = Math.floor(Math.random() * (baseTTL * 0.1)); // 10% jitter
  return RunCache.set({
    key,
    value,
    ttl: baseTTL + jitter
  });
}

// Usage
await setWithJitter('api-data-1', jsonData1, 300000);
await setWithJitter('api-data-2', jsonData2, 300000);
await setWithJitter('api-data-3', jsonData3, 300000);
```

### 3. Batch Related Operations

Group related cache operations to minimize overhead:

```typescript
// Less efficient - multiple separate operations
for (const id of userIds) {
  await RunCache.set({ key: `user:${id}:profile`, value: profiles[id] });
}

// More efficient - batch processing
async function batchSetProfiles(profiles) {
  const operations = Object.entries(profiles).map(([id, profile]) => 
    RunCache.set({ key: `user:${id}:profile`, value: profile })
  );
  await Promise.all(operations);
}

await batchSetProfiles(profiles);
```

### 4. Use Structured Key Naming

Adopt a consistent key naming convention for efficient pattern matching:

```typescript
// Good - structured naming
await RunCache.set({ key: 'user:1:profile', value: '...' });
await RunCache.set({ key: 'user:1:preferences', value: '...' });
await RunCache.set({ key: 'post:123:comments', value: '...' });

// Efficient operations on groups
await RunCache.delete('user:1:*'); // Delete all user 1 data
const allUserData = await RunCache.get('user:*:profile'); // Get all user profiles
```

### 5. Implement Cache Warming

Pre-populate critical cache entries on application startup:

```typescript
async function warmCache() {
  console.log('Warming cache...');
  
  // Check if entries already exist
  const hasConfig = await RunCache.has('app:config');
  const hasGlobalData = await RunCache.has('app:global-data');
  
  // Warm up only what's missing
  if (!hasConfig) {
    const config = await fetchAppConfig();
    await RunCache.set({ key: 'app:config', value: JSON.stringify(config) });
  }
  
  if (!hasGlobalData) {
    const globalData = await fetchGlobalData();
    await RunCache.set({ key: 'app:global-data', value: JSON.stringify(globalData) });
  }
  
  console.log('Cache warming complete');
}

// Call on application startup
warmCache();
```

## Memory Leak Prevention

### 1. Clean Up Event Listeners

```typescript
// Set up event listener
const handleRefetch = (event) => {
  console.log(`Refreshed: ${event.key}`);
};

RunCache.onRefetch(handleRefetch);

// Later, when no longer needed
RunCache.clearEventListeners({
  event: EVENT.REFETCH,
  handler: handleRefetch // Remove specific handler
});
```

### 2. Avoid Reference Cycles

Be careful with metadata that might create reference cycles:

```typescript
// Potentially problematic - circular reference
const obj = {};
obj.self = obj;

await RunCache.set({
  key: 'data',
  value: 'value',
  metadata: { circular: obj } // Creates a reference cycle
});

// Better - avoid circular references
await RunCache.set({
  key: 'data',
  value: 'value',
  metadata: { id: 123, type: 'example' } // Simple metadata
});
```

### 3. Monitor Memory Usage

Implement memory usage monitoring:

```typescript
// Periodically check memory usage
setInterval(() => {
  if (process.memoryUsage) {
    const memUsage = process.memoryUsage();
    console.log(`Memory usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`);
    
    // If memory usage is too high, clear some cache
    if (memUsage.heapUsed > MEMORY_THRESHOLD) {
      console.log('Memory usage too high, clearing temporary cache entries');
      RunCache.delete('temp:*');
    }
  }
}, 60000); // Check every minute
```

## Next Steps

Now that you understand resource management, explore these related topics:

- [Eviction Policies](../features/eviction-policies.md) - Learn more about cache eviction strategies
- [TTL and Expiration](../features/ttl-expiration.md) - Understand time-to-live functionality
- [Persistent Storage](./persistent-storage.md) - Learn about saving cache data across application restarts
- [Middleware](./middleware.md) - Explore how to intercept and transform cache operations 