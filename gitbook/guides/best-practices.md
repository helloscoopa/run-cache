# Best Practices

This guide provides recommendations and best practices for using RunCache effectively in your applications. Following these guidelines will help you optimize performance, maintain data consistency, and avoid common pitfalls.

## Cache Key Design

### Use Structured Key Naming

Adopt a consistent key naming convention to make pattern matching more effective and your code more maintainable:

```typescript
// Good - structured naming with clear segments
await RunCache.set({ key: 'user:1:profile', value: '...' });
await RunCache.set({ key: 'user:1:settings', value: '...' });
await RunCache.set({ key: 'post:123:comments', value: '...' });

// Less effective - inconsistent naming
await RunCache.set({ key: 'user1Profile', value: '...' });
await RunCache.set({ key: 'user1_settings', value: '...' });
await RunCache.set({ key: 'post123Comments', value: '...' });
```

### Recommended Key Structure

A common convention is to use colons (`:`) as separators for hierarchical keys:

```
entity:id:attribute
```

Examples:
- `user:1:profile` - Profile for user with ID 1
- `product:xyz:details` - Details for product with ID xyz
- `api:users:list:page=1:limit=20` - API response for users list with pagination

### Be Specific with Keys

Make keys as specific as needed to avoid collisions:

```typescript
// Too generic - might cause collisions
await RunCache.set({ key: 'profile', value: '...' });

// Better - more specific
await RunCache.set({ key: 'user:1:profile', value: '...' });
```

## TTL and Expiration

### Match TTL to Data Volatility

Set TTL values based on how frequently the underlying data changes:

```typescript
// Frequently changing data
await RunCache.set({
  key: 'stock-price',
  value: JSON.stringify(price),
  ttl: 60 * 1000 // 1 minute
});

// Relatively stable data
await RunCache.set({
  key: 'product-catalog',
  value: JSON.stringify(catalog),
  ttl: 60 * 60 * 1000 // 1 hour
});

// Very stable data
await RunCache.set({
  key: 'app-configuration',
  value: JSON.stringify(config),
  ttl: 24 * 60 * 60 * 1000 // 1 day
});
```

### Define TTL Constants

Create constants for common TTL values to ensure consistency:

```typescript
// Define TTL constants
const TTL = {
  SHORT: 60 * 1000,         // 1 minute
  MEDIUM: 30 * 60 * 1000,   // 30 minutes
  LONG: 60 * 60 * 1000,     // 1 hour
  VERY_LONG: 24 * 60 * 60 * 1000 // 1 day
};

// Use constants consistently
await RunCache.set({ key: 'user:1:profile', value: '...', ttl: TTL.LONG });
await RunCache.set({ key: 'api:weather', value: '...', ttl: TTL.SHORT });
```

### Implement Staggered Expiration

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

## Source Functions

### Keep Source Functions Pure

Source functions should:
- Have no side effects
- Return the same result for the same inputs
- Not depend on external state that might change

```typescript
// Good - pure function
await RunCache.set({
  key: 'user:1',
  sourceFn: () => fetchUserById(1)
});

// Avoid - depends on external state
let currentUserId = 1;
await RunCache.set({
  key: 'current-user',
  sourceFn: () => fetchUserById(currentUserId) // Will break if currentUserId changes
});
```

### Handle Errors Properly

Always implement error handling in your source functions:

```typescript
await RunCache.set({
  key: 'api-data',
  sourceFn: async () => {
    try {
      const response = await fetch('https://api.example.com/data');
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      const data = await response.json();
      return JSON.stringify(data);
    } catch (error) {
      console.error('Source function error:', error);
      throw error; // Rethrow to let RunCache handle it
    }
  }
});
```

### Optimize for Performance

Keep source functions efficient:
- Fetch only the data you need
- Use appropriate caching headers for API requests
- Consider batching related requests

```typescript
// Inefficient - fetches too much data
await RunCache.set({
  key: 'user-name',
  sourceFn: async () => {
    const response = await fetch('https://api.example.com/users/1');
    const user = await response.json();
    return JSON.stringify(user.name); // Only needed the name
  }
});

// Better - uses a more targeted endpoint
await RunCache.set({
  key: 'user-name',
  sourceFn: async () => {
    const response = await fetch('https://api.example.com/users/1/name');
    const name = await response.text();
    return name;
  }
});
```

## Automatic Refetching

### Use for Critical Data Only

Automatic refetching is most beneficial for:
- Frequently accessed data
- Data that should never be unavailable
- Data where freshness is important but not critical

```typescript
// Good candidate for autoRefetch
await RunCache.set({
  key: 'global-settings',
  sourceFn: () => fetchGlobalSettings(),
  ttl: 5 * 60 * 1000,
  autoRefetch: true
});

// May not need autoRefetch
await RunCache.set({
  key: 'user-activity-log',
  sourceFn: () => fetchUserActivity(),
  ttl: 30 * 60 * 1000
  // No autoRefetch as it's less critical
});
```

### Implement Proper Error Handling

Always handle potential failures in automatic refetching:

```typescript
RunCache.onRefetchFailure((event) => {
  // Log the error
  console.error(`Refetch failed for ${event.key}:`, event.error);
  
  // Implement exponential backoff retry
  const retryCount = (event.metadata?.retryCount || 0) + 1;
  const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30 seconds
  
  setTimeout(() => {
    RunCache.refetch(event.key, { 
      metadata: { retryCount } 
    });
  }, delay);
});
```

## Pattern Matching

### Be Specific with Patterns

Use patterns that are as specific as possible to avoid unintended matches:

```typescript
// Too broad - might match unrelated keys
await RunCache.delete('user*');

// Better - more specific pattern
await RunCache.delete('user:*');

// Best - most specific pattern for the use case
await RunCache.delete('user:1:*');
```

### Consider Performance Implications

Pattern matching operations require checking all cache keys, which can be expensive for large caches:

```typescript
// Inefficient for large caches - checks all keys
const allUserData = await RunCache.get('user:*');

// More efficient - use specific patterns when possible
const specificUserData = await RunCache.get('user:1:*');
```

## Tags and Dependencies

### Use Tags for Broad Grouping

Tags are ideal for grouping related cache entries that need to be invalidated together:

```typescript
// Set entries with tags
await RunCache.set({ 
  key: 'user:1:profile', 
  value: '...', 
  tags: ['user:1', 'profile']
});

await RunCache.set({ 
  key: 'user:1:settings', 
  value: '...', 
  tags: ['user:1', 'settings']
});

// Later, invalidate all user:1 data
RunCache.invalidateByTag('user:1');
```

### Use Dependencies for Derived Data

Dependencies are ideal for derived data that depends on base data:

```typescript
// Primary data
await RunCache.set({
  key: 'user:1:profile',
  value: JSON.stringify({ name: 'John Doe' })
});

// Dependent data
await RunCache.set({
  key: 'user:1:dashboard',
  value: JSON.stringify({ widgets: [...] }),
  dependencies: ['user:1:profile'] // This entry depends on the profile
});

// When user:1:profile changes, user:1:dashboard will be automatically invalidated
```

### Avoid Deep Dependency Chains

Deep dependency chains can lead to widespread invalidations:

```typescript
// Potentially problematic - deep dependency chain
A → B → C → D → E → F → G

// Better - flatter dependency structure
A → B, C, D
E → F, G
```

## Event System

### Keep Event Handlers Lightweight

Event handlers should be fast and non-blocking:

```typescript
// Good - lightweight handler
RunCache.onExpiry((event) => {
  console.log(`Cache expired: ${event.key}`);
});

// Avoid - heavy processing in handler
RunCache.onExpiry(async (event) => {
  // DON'T do this - blocks the event loop
  await heavyProcessing();
  await networkRequest();
});
```

If you need to perform heavy work, delegate it to a separate process or queue.

### Clean Up Event Listeners

Remove event listeners when they're no longer needed:

```typescript
// In a component or module initialization
function initializeModule() {
  // Set up event listeners
  RunCache.onKeyRefetch('module-data', handleRefetch);
  
  // Return cleanup function
  return () => {
    RunCache.clearEventListeners({
      event: EVENT.REFETCH,
      key: 'module-data'
    });
  };
}

// Later, when shutting down
const cleanup = initializeModule();
// When module is unloaded
cleanup();
```

## Memory Management

### Set Appropriate Cache Size Limits

Configure maximum cache size based on your application's memory constraints:

```typescript
// Configure cache with size limits
RunCache.configure({
  maxSize: 1000, // Limit to 1000 entries
  evictionPolicy: EvictionPolicy.LRU
});
```

### Choose the Right Eviction Policy

Select an eviction policy that matches your access patterns:

- **LRU (Least Recently Used)**: Best for most applications where recently accessed items are likely to be accessed again
- **LFU (Least Frequently Used)**: Better for cases where access frequency is more important than recency
- **NONE**: Use only when you want manual control over eviction or have other TTL-based mechanisms

```typescript
// For most applications
RunCache.configure({
  maxSize: 1000,
  evictionPolicy: EvictionPolicy.LRU
});

// For frequency-based patterns
RunCache.configure({
  maxSize: 1000,
  evictionPolicy: EvictionPolicy.LFU
});
```

### Optimize Value Size

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

## Persistent Storage

### Choose the Right Storage Adapter

Select the appropriate storage adapter based on your environment and requirements:

- **LocalStorageAdapter**: For browser environments with small cache data
- **IndexedDBAdapter**: For browser environments with larger cache data
- **FilesystemAdapter**: For Node.js applications

```typescript
// For browser with small data
RunCache.configure({
  storageAdapter: new LocalStorageAdapter()
});

// For browser with larger data
RunCache.configure({
  storageAdapter: new IndexedDBAdapter()
});

// For Node.js applications
RunCache.configure({
  storageAdapter: new FilesystemAdapter()
});
```

### Handle Storage Errors

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

### Use Appropriate Save Intervals

Balance between data freshness and performance:

```typescript
// For frequently changing data, save more often
RunCache.setupAutoSave(60000); // 1 minute

// For relatively stable data, save less frequently
RunCache.setupAutoSave(3600000); // 1 hour
```

## Error Handling

### Handle Cache Misses Gracefully

Always handle potential cache misses:

```typescript
// Good - handles cache miss
const userData = await RunCache.get('user:1');
if (userData) {
  // Cache hit
  const user = JSON.parse(userData);
  displayUser(user);
} else {
  // Cache miss
  showLoadingIndicator();
  const user = await fetchUserFromApi(1);
  await RunCache.set({ key: 'user:1', value: JSON.stringify(user) });
  displayUser(user);
}
```

### Implement Circuit Breakers

For critical systems, implement circuit breakers to prevent cascading failures:

```typescript
let cacheFailures = 0;
const FAILURE_THRESHOLD = 5;
const RESET_TIMEOUT = 60000; // 1 minute

async function getCachedData(key) {
  if (cacheFailures >= FAILURE_THRESHOLD) {
    // Circuit is open, bypass cache
    return fetchDataFromSource(key);
  }
  
  try {
    const data = await RunCache.get(key);
    if (data) return JSON.parse(data);
    
    // Cache miss, fetch from source
    const sourceData = await fetchDataFromSource(key);
    try {
      await RunCache.set({ key, value: JSON.stringify(sourceData) });
    } catch (error) {
      cacheFailures++;
      if (cacheFailures === FAILURE_THRESHOLD) {
        console.error('Cache circuit opened due to repeated failures');
        setTimeout(() => {
          cacheFailures = 0;
          console.log('Cache circuit reset');
        }, RESET_TIMEOUT);
      }
    }
    return sourceData;
  } catch (error) {
    cacheFailures++;
    // Fall back to source on cache error
    return fetchDataFromSource(key);
  }
}
```

## Performance Optimization

### Batch Related Operations

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

### Implement Cache Warming

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

### Use Middleware for Cross-Cutting Concerns

Implement middleware for functionality that applies to all cache operations:

```typescript
// Add logging middleware
RunCache.use(async (value, context, next) => {
  const start = Date.now();
  const result = await next(value);
  const duration = Date.now() - start;
  
  console.log(`${context.operation} operation for key: ${context.key} took ${duration}ms`);
  return result;
});

// Add encryption middleware
RunCache.use(async (value, context, next) => {
  if (context.operation === 'set' && value) {
    return next(encrypt(value));
  } else if (context.operation === 'get' && value) {
    const encrypted = await next(value);
    return encrypted ? decrypt(encrypted) : undefined;
  }
  return next(value);
});
```

## Testing

### Mock RunCache for Unit Tests

Create a mock version of RunCache for unit testing:

```typescript
// mock-run-cache.ts
import { RunCache } from 'run-cache';

// Save original methods
const originalMethods = {
  get: RunCache.get,
  set: RunCache.set,
  delete: RunCache.delete,
  flush: RunCache.flush
};

// Mock data
let mockData = new Map();

// Mock implementation
export function mockRunCache() {
  // Mock get
  RunCache.get = jest.fn(async (key) => {
    return mockData.get(key);
  });
  
  // Mock set
  RunCache.set = jest.fn(async (options) => {
    mockData.set(options.key, options.value);
    return true;
  });
  
  // Mock delete
  RunCache.delete = jest.fn(async (key) => {
    mockData.delete(key);
    return true;
  });
  
  // Mock flush
  RunCache.flush = jest.fn(async () => {
    mockData.clear();
  });
  
  // Helper to set mock data directly
  return {
    setMockData: (key, value) => mockData.set(key, value),
    clearMockData: () => mockData.clear(),
    restore: () => {
      RunCache.get = originalMethods.get;
      RunCache.set = originalMethods.set;
      RunCache.delete = originalMethods.delete;
      RunCache.flush = originalMethods.flush;
    }
  };
}
```

### Write Integration Tests

Test the cache with actual storage adapters:

```typescript
// Use in-memory adapter for tests
import { RunCache, MemoryStorageAdapter } from 'run-cache';

describe('Cache Integration Tests', () => {
  beforeEach(async () => {
    // Set up fresh cache for each test
    RunCache.configure({
      storageAdapter: new MemoryStorageAdapter()
    });
    await RunCache.flush();
  });
  
  test('should store and retrieve values', async () => {
    await RunCache.set({ key: 'test-key', value: 'test-value' });
    const value = await RunCache.get('test-key');
    expect(value).toBe('test-value');
  });
  
  test('should respect TTL', async () => {
    await RunCache.set({ key: 'expiring-key', value: 'value', ttl: 100 });
    
    // Should exist initially
    expect(await RunCache.has('expiring-key')).toBe(true);
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Should be gone after TTL
    expect(await RunCache.has('expiring-key')).toBe(false);
  });
});
```

## Monitoring and Logging

### Track Cache Performance Metrics

Implement monitoring to track cache performance:

```typescript
// Set up cache metrics
let metrics = {
  hits: 0,
  misses: 0,
  expirations: 0,
  refetches: 0,
  errors: 0
};

// Add monitoring middleware
RunCache.use(async (value, context, next) => {
  if (context.operation === 'get') {
    const result = await next(value);
    if (result) {
      metrics.hits++;
    } else {
      metrics.misses++;
    }
    return result;
  }
  return next(value);
});

// Monitor events
RunCache.onExpiry(() => metrics.expirations++);
RunCache.onRefetch(() => metrics.refetches++);
RunCache.onRefetchFailure(() => metrics.errors++);

// Report metrics periodically
setInterval(() => {
  const hitRatio = metrics.hits / (metrics.hits + metrics.misses || 1);
  console.log(`Cache performance: ${(hitRatio * 100).toFixed(2)}% hit ratio`);
  console.log(`Expirations: ${metrics.expirations}, Refetches: ${metrics.refetches}, Errors: ${metrics.errors}`);
  
  // Send to monitoring system
  sendMetricsToMonitoring({
    cacheHitRatio: hitRatio,
    cacheExpirations: metrics.expirations,
    cacheRefetches: metrics.refetches,
    cacheErrors: metrics.errors
  });
  
  // Reset counters
  metrics = { hits: 0, misses: 0, expirations: 0, refetches: 0, errors: 0 };
}, 60000); // Every minute
```

### Implement Comprehensive Logging

Use middleware and events for comprehensive logging:

```typescript
// Log all cache operations
RunCache.use(async (value, context, next) => {
  console.log(`Cache operation: ${context.operation}, Key: ${context.key}`);
  return next(value);
});

// Log cache events
RunCache.onExpiry((event) => {
  console.log(`Cache expired: ${event.key}`);
});

RunCache.onRefetch((event) => {
  console.log(`Cache refreshed: ${event.key}`);
});

RunCache.onRefetchFailure((event) => {
  console.error(`Cache refresh failed: ${event.key}`, event.error);
});
```

## Next Steps

Now that you understand the best practices for using RunCache, explore these related topics:

- [Performance Optimization](./performance.md) - Learn more about optimizing cache performance
- [Debugging and Logging](./debugging.md) - Understand how to troubleshoot cache issues
- [Migration Guide](./migration.md) - Learn how to upgrade from previous versions
- [API Reference](../api/run-cache.md) - Explore the complete RunCache API 