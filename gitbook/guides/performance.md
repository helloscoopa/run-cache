# Performance Optimization

This guide provides techniques and strategies for optimizing the performance of RunCache in your applications. By following these recommendations, you can improve cache efficiency, reduce memory usage, and enhance the overall performance of your application.

## Understanding RunCache Performance

RunCache is designed to be lightweight and efficient, but like any caching solution, its performance can be affected by:

- Size of the cache
- Complexity of keys and patterns
- Frequency of operations
- Middleware overhead
- Event listener quantity
- Source function performance
- Storage adapter efficiency

## Optimizing Cache Configuration

### Size Limits and Eviction Policies

Configure appropriate size limits and eviction policies for your use case:

```typescript
import { RunCache, EvictionPolicy } from 'run-cache';

// For most applications
RunCache.configure({
  maxSize: 1000, // Limit to 1000 entries
  evictionPolicy: EvictionPolicy.LRU
});
```

Choose the right eviction policy:
- **LRU (Least Recently Used)**: Best for most applications
- **LFU (Least Frequently Used)**: Better when access frequency is more important than recency
- **NONE**: Use only when other mechanisms control cache size (like TTL)

### Determining Optimal Cache Size

To determine the optimal cache size:

1. Monitor memory usage with different cache sizes
2. Analyze cache hit/miss rates
3. Balance memory usage against performance gains

```typescript
// Monitor memory usage periodically
setInterval(() => {
  const memUsage = process.memoryUsage();
  const cacheSize = getCacheSize(); // Your function to get current entry count
  console.log(`Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB, Cache entries: ${cacheSize}`);
}, 60000);

// Monitor hit rate with middleware
let hits = 0;
let misses = 0;

RunCache.use(async (value, context, next) => {
  if (context.operation === 'get') {
    const result = await next(value);
    if (result) {
      hits++;
    } else {
      misses++;
    }
    return result;
  }
  return next(value);
});

// Log hit rate periodically
setInterval(() => {
  const hitRate = hits / (hits + misses || 1);
  console.log(`Cache hit rate: ${(hitRate * 100).toFixed(2)}%`);
  hits = 0;
  misses = 0;
}, 60000);
```

## Optimizing Cache Keys

### Key Design for Performance

Key design significantly impacts performance:

```typescript
// Less efficient - complex keys
await RunCache.set({ key: `user:${userId}:preferences:theme:color:mode:${mode}:variant:${variant}`, value: '...' });

// More efficient - simpler keys with structured data
await RunCache.set({ 
  key: `user:${userId}:theme-settings`,
  value: JSON.stringify({ mode, variant, color })
});
```

### Key Length

Shorter keys use less memory and are faster to compare:

```typescript
// Less efficient - long keys
await RunCache.set({ key: 'very-long-namespace:user-preferences:for-user-with-id:12345:theme-settings', value: '...' });

// More efficient - shorter keys
await RunCache.set({ key: 'u:12345:prefs', value: '...' });
```

## Optimizing Source Functions

### Minimize Processing

Keep source functions focused and efficient:

```typescript
// Less efficient - does too much processing
await RunCache.set({
  key: 'data',
  sourceFn: async () => {
    const rawData = await fetchData();
    const transformed = complexTransformation(rawData);
    const filtered = filterData(transformed);
    const sorted = sortData(filtered);
    return JSON.stringify(sorted);
  }
});

// More efficient - only essential processing
await RunCache.set({
  key: 'data',
  sourceFn: async () => {
    const data = await fetchData();
    return JSON.stringify(data);
  }
});

// Process data when needed
const processData = (data) => {
  // Do processing only when actually needed
  return sortData(filterData(complexTransformation(data)));
};
```

### Use Memoization

For expensive source functions, consider memoization:

```typescript
// Create a memoized source function
function createMemoizedSourceFn(fn, maxAge = 60000) {
  let cachedResult = null;
  let cachedAt = 0;
  
  return async () => {
    const now = Date.now();
    if (!cachedResult || now - cachedAt > maxAge) {
      cachedResult = await fn();
      cachedAt = now;
    }
    return cachedResult;
  };
}

// Usage
const expensiveDataFetch = createMemoizedSourceFn(async () => {
  const data = await fetchExpensiveData();
  return JSON.stringify(data);
});

await RunCache.set({
  key: 'expensive-data',
  sourceFn: expensiveDataFetch
});
```

## Optimizing Pattern Matching

### Be Specific with Patterns

More specific patterns are faster to process:

```typescript
// Less efficient - very broad pattern
await RunCache.get('*');

// More efficient - more specific pattern
await RunCache.get('user:*');

// Most efficient - highly specific pattern
await RunCache.get('user:1:*');
```

### Limit Pattern Usage

Use patterns only when necessary:

```typescript
// Less efficient - always using patterns
await RunCache.get('user:*'); // Even when you know the exact key

// More efficient - direct key access when possible
await RunCache.get('user:1'); // Use direct key when known
```

## Batch Operations

### Use Promise.all for Batch Operations

Process multiple operations concurrently:

```typescript
// Less efficient - sequential operations
for (const id of userIds) {
  await RunCache.set({ key: `user:${id}`, value: userData[id] });
}

// More efficient - parallel operations
await Promise.all(
  userIds.map(id => RunCache.set({ key: `user:${id}`, value: userData[id] }))
);
```

### Implement Custom Batch Methods

For frequent batch operations, create helper functions:

```typescript
// Batch get helper
async function batchGet(keys) {
  return Promise.all(keys.map(key => RunCache.get(key)));
}

// Batch set helper
async function batchSet(entries) {
  return Promise.all(
    entries.map(entry => RunCache.set(entry))
  );
}

// Usage
const userIds = ['1', '2', '3'];
const userKeys = userIds.map(id => `user:${id}`);

// Batch get
const userValues = await batchGet(userKeys);

// Batch set
const entries = userIds.map(id => ({
  key: `user:${id}`,
  value: JSON.stringify({ name: `User ${id}` })
}));
await batchSet(entries);
```

## Optimizing Middleware

### Limit Middleware Complexity

Keep middleware functions simple and focused:

```typescript
// Less efficient - complex middleware
RunCache.use(async (value, context, next) => {
  console.log(`Start ${context.operation} for ${context.key}`);
  const start = Date.now();
  try {
    const complexMetadata = await fetchAdditionalData();
    const result = await next(value);
    if (result) {
      await processResult(result);
    }
    const end = Date.now();
    console.log(`End ${context.operation} for ${context.key}, took ${end - start}ms`);
    return result;
  } catch (e) {
    console.error(e);
    const end = Date.now();
    console.log(`Failed ${context.operation} for ${context.key}, took ${end - start}ms`);
    throw e;
  }
});

// More efficient - simpler middleware
RunCache.use(async (value, context, next) => {
  const start = Date.now();
  const result = await next(value);
  const duration = Date.now() - start;
  
  if (duration > 100) { // Only log slow operations
    console.log(`Slow operation: ${context.operation} for ${context.key}, took ${duration}ms`);
  }
  
  return result;
});
```

### Optimize Middleware Order

Order middleware for optimal performance:

```typescript
// Less efficient - expensive middleware runs first
RunCache.use(expensiveMiddleware); // Runs for all operations
RunCache.use(filterMiddleware);    // Could have filtered out some operations

// More efficient - filtering middleware runs first
RunCache.use(filterMiddleware);    // Filters out operations
RunCache.use(expensiveMiddleware); // Only runs for filtered operations
```

## Optimizing Event Listeners

### Limit Event Listeners

Use specific event listeners rather than global ones:

```typescript
// Less efficient - global listener for all events
RunCache.onExpiry((event) => {
  // Process all expiry events, even for keys we don't care about
  console.log(`Key expired: ${event.key}`);
});

// More efficient - specific listener
RunCache.onKeyExpiry('important-data', (event) => {
  // Only process events for 'important-data'
  console.log('Important data expired');
});
```

### Use Pattern-Based Listeners Wisely

Be specific with event listener patterns:

```typescript
// Less efficient - very broad pattern
RunCache.onKeyExpiry('*', (event) => {
  // Triggered for ALL expiry events
});

// More efficient - more specific pattern
RunCache.onKeyExpiry('user:*', (event) => {
  // Only triggered for user-related expirations
});
```

## Memory Optimization

### Value Size Optimization

Minimize the size of cached values:

```typescript
// Less efficient - storing large objects
await RunCache.set({
  key: 'large-report',
  value: JSON.stringify({
    fullData: largeDataSet,       // Unnecessary complete dataset
    processedResults: results,
    generatedAt: new Date().toISOString(),
    generatedBy: 'system',
    version: '1.0',
    // ... many more fields
  })
});

// More efficient - store only essential data
await RunCache.set({
  key: 'report-summary',
  value: JSON.stringify({
    highlights: summaryResults,
    timestamp: Date.now()
  })
});

// Store additional data separately if needed
await RunCache.set({
  key: 'report-details',
  value: JSON.stringify(detailedResults),
  ttl: 3600000 // Shorter TTL for detailed data
});
```

### TTL Strategies

Use appropriate TTL values to prevent memory bloat:

```typescript
// Strategy: Use shorter TTL for larger data
await RunCache.set({
  key: 'small-config',
  value: JSON.stringify(smallConfig),
  ttl: 86400000 // 24 hours for small data
});

await RunCache.set({
  key: 'large-dataset',
  value: JSON.stringify(largeDataset),
  ttl: 3600000 // 1 hour for large data
});

// Strategy: Tiered caching with different TTLs
await RunCache.set({
  key: 'user:summary',
  value: JSON.stringify(userSummary),
  ttl: 86400000 // 24 hours for summary
});

await RunCache.set({
  key: 'user:details',
  value: JSON.stringify(userDetails),
  ttl: 3600000 // 1 hour for details
});

await RunCache.set({
  key: 'user:activity',
  value: JSON.stringify(userActivity),
  ttl: 300000 // 5 minutes for activity
});
```

## Storage Adapter Optimization

### Choose the Right Adapter

Select the most appropriate storage adapter for your needs:

```typescript
// For browser environments with small data
RunCache.configure({
  storageAdapter: new LocalStorageAdapter()
});

// For browser environments with larger data
RunCache.configure({
  storageAdapter: new IndexedDBAdapter()
});

// For Node.js environments
RunCache.configure({
  storageAdapter: new FilesystemAdapter()
});
```

### Optimize Save Frequency

Balance persistence needs with performance:

```typescript
// Too frequent - performance impact
RunCache.setupAutoSave(1000); // Save every second

// More balanced
RunCache.setupAutoSave(300000); // Save every 5 minutes

// For mostly read-only data
RunCache.setupAutoSave(3600000); // Save every hour
```

## Advanced Performance Techniques

### Implement Custom Metrics Tracking

Track performance metrics to identify bottlenecks:

```typescript
// Add performance tracking
const metrics = {
  operations: {
    get: { count: 0, totalTime: 0 },
    set: { count: 0, totalTime: 0 },
    delete: { count: 0, totalTime: 0 }
  },
  hits: 0,
  misses: 0
};

// Performance middleware
RunCache.use(async (value, context, next) => {
  const start = performance.now();
  const result = await next(value);
  const duration = performance.now() - start;
  
  // Track operation time
  if (metrics.operations[context.operation]) {
    metrics.operations[context.operation].count++;
    metrics.operations[context.operation].totalTime += duration;
  }
  
  // Track hits/misses
  if (context.operation === 'get') {
    if (result) metrics.hits++;
    else metrics.misses++;
  }
  
  return result;
});

// Report metrics periodically
setInterval(() => {
  const hitRatio = metrics.hits / (metrics.hits + metrics.misses || 1);
  
  console.log(`Cache Performance Metrics:`);
  console.log(`Hit ratio: ${(hitRatio * 100).toFixed(2)}%`);
  
  for (const [op, data] of Object.entries(metrics.operations)) {
    if (data.count > 0) {
      const avgTime = data.totalTime / data.count;
      console.log(`${op}: ${data.count} operations, avg ${avgTime.toFixed(2)}ms`);
    }
  }
  
  // Reset metrics
  for (const op in metrics.operations) {
    metrics.operations[op] = { count: 0, totalTime: 0 };
  }
  metrics.hits = 0;
  metrics.misses = 0;
}, 60000);
```

### Implement Sharding for Large Caches

For very large caches, implement a sharding strategy:

```typescript
// Create a simple sharded cache manager
class ShardedCache {
  private shards: Map<string, typeof RunCache>[] = [];
  private shardCount: number;
  
  constructor(shardCount = 16) {
    this.shardCount = shardCount;
    
    // Initialize shards
    for (let i = 0; i < shardCount; i++) {
      this.shards.push(new Map());
    }
  }
  
  private getShardIndex(key: string): number {
    // Simple hash function for shard selection
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash) + key.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash) % this.shardCount;
  }
  
  async get(key: string): Promise<string | undefined> {
    const shardIndex = this.getShardIndex(key);
    // Implement actual logic to get from the appropriate RunCache instance
    // This is a simplified example
    return "implementation";
  }
  
  async set(options: any): Promise<void> {
    const shardIndex = this.getShardIndex(options.key);
    // Implement actual logic to set in the appropriate RunCache instance
  }
  
  // Additional methods as needed
}

// Usage
const shardedCache = new ShardedCache(32); // 32 shards
await shardedCache.set({ key: 'user:1', value: 'data' });
const value = await shardedCache.get('user:1');
```

## Measuring Performance

### Benchmarking Cache Operations

Create benchmarks to test different cache configurations:

```typescript
async function benchmarkCache() {
  console.log('Starting cache benchmark...');
  
  // Prepare test data
  const testData = Array.from({ length: 1000 }, (_, i) => ({
    key: `test:${i}`,
    value: JSON.stringify({ id: i, data: `Test data ${i}` })
  }));
  
  // Benchmark set operations
  const setStart = performance.now();
  await Promise.all(testData.map(item => 
    RunCache.set({ key: item.key, value: item.value })
  ));
  const setTime = performance.now() - setStart;
  console.log(`Set 1000 items: ${setTime.toFixed(2)}ms (${(setTime / 1000).toFixed(2)}ms per item)`);
  
  // Benchmark get operations (existing keys)
  const getStart = performance.now();
  await Promise.all(testData.map(item => RunCache.get(item.key)));
  const getTime = performance.now() - getStart;
  console.log(`Get 1000 existing items: ${getTime.toFixed(2)}ms (${(getTime / 1000).toFixed(2)}ms per item)`);
  
  // Benchmark pattern matching
  const patternStart = performance.now();
  await RunCache.get('test:*');
  const patternTime = performance.now() - patternStart;
  console.log(`Pattern match 1000 items: ${patternTime.toFixed(2)}ms`);
  
  // Benchmark delete operations
  const deleteStart = performance.now();
  await Promise.all(testData.map(item => RunCache.delete(item.key)));
  const deleteTime = performance.now() - deleteStart;
  console.log(`Delete 1000 items: ${deleteTime.toFixed(2)}ms (${(deleteTime / 1000).toFixed(2)}ms per item)`);
}

// Run benchmark
benchmarkCache();
```

## Next Steps

After implementing these performance optimizations, consider these next steps:

- [Debugging and Logging](./debugging.md) - Learn how to diagnose performance issues
- [Resource Management](../advanced/resource-management.md) - Understand memory management and cleanup
- [Best Practices](./best-practices.md) - Explore general best practices for RunCache
- [Event System](../advanced/event-system.md) - Learn how to use events efficiently 