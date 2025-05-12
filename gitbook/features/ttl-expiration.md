# TTL and Expiration

Time-to-Live (TTL) is a fundamental feature of RunCache that allows you to control how long cache entries remain valid. This guide explains how TTL works and how to effectively use it in your applications.

## Understanding TTL

TTL (Time-to-Live) defines the lifespan of a cache entry in milliseconds. After the TTL period expires, the cache entry is considered stale and will be removed from the cache when accessed.

Key benefits of using TTL:

- **Data Freshness**: Ensures cached data doesn't become too stale
- **Memory Management**: Helps prevent the cache from growing indefinitely
- **Consistency**: Provides a mechanism to periodically refresh data

## Setting TTL

You can set TTL when creating a cache entry using the `set` method:

```typescript
await RunCache.set({ 
  key: 'user-profile', 
  value: JSON.stringify({ name: 'John Doe' }),
  ttl: 3600000 // 1 hour in milliseconds
});
```

### Common TTL Values

Here are some common TTL values for reference:

```typescript
const TTL = {
  MINUTE: 60 * 1000,         // 60,000 ms
  HOUR: 60 * 60 * 1000,      // 3,600,000 ms
  DAY: 24 * 60 * 60 * 1000,  // 86,400,000 ms
  WEEK: 7 * 24 * 60 * 60 * 1000 // 604,800,000 ms
};

// Examples
await RunCache.set({ key: 'frequently-updated', value: 'data', ttl: TTL.MINUTE });
await RunCache.set({ key: 'daily-stats', value: 'statistics', ttl: TTL.DAY });
```

## How Expiration Works

When a cache entry's TTL expires:

1. The entry is not immediately removed from memory
2. The entry is marked as expired
3. When `get()` is called for that key, RunCache checks if it's expired
4. If expired, the entry is removed and `get()` returns `undefined` (unless `autoRefetch` is enabled)

This lazy expiration approach is efficient as it only processes expired entries when they're accessed.

## Checking Expiration Status

You can check if a key exists (and hasn't expired) using the `has` method:

```typescript
const isValid = await RunCache.has('user-profile');
if (isValid) {
  console.log('The user profile is still valid');
} else {
  console.log('The user profile has expired or doesn\'t exist');
}
```

## Expiry Events

RunCache provides an event system to monitor when cache entries expire:

```typescript
// Global expiry event
RunCache.onExpiry((event) => {
  console.log(`Cache key ${event.key} expired at ${new Date(event.updatedAt + event.ttl).toISOString()}`);
});

// Specific key expiry
RunCache.onKeyExpiry("api-data", (event) => {
  console.log(`API data cache expired`);
});

// Pattern-based expiry events
RunCache.onKeyExpiry("user-*", (event) => {
  console.log(`User cache ${event.key} expired`);
});
```

These events can be useful for:
- Logging and monitoring
- Triggering background processes
- Updating UI components when data becomes stale

## TTL with Source Functions

When using source functions with TTL, you can create a powerful pattern for keeping cached data fresh:

```typescript
await RunCache.set({
  key: 'weather-data',
  sourceFn: async () => {
    const response = await fetch('https://api.weather.com/current');
    const data = await response.json();
    return JSON.stringify(data);
  },
  ttl: 30 * 60 * 1000 // 30 minutes
});
```

In this example:
1. The first call to `RunCache.get('weather-data')` will fetch from the API
2. Subsequent calls within 30 minutes will return the cached data
3. After 30 minutes, the next call will trigger a new API fetch

## Automatic Refetching

For critical data that should always be available, you can combine TTL with automatic refetching:

```typescript
await RunCache.set({
  key: 'critical-stats',
  sourceFn: async () => {
    const response = await fetch('https://api.example.com/stats');
    const data = await response.json();
    return JSON.stringify(data);
  },
  ttl: 5 * 60 * 1000, // 5 minutes
  autoRefetch: true
});
```

With `autoRefetch: true`:
1. When the TTL expires, the next `get()` call will return the stale data immediately
2. Simultaneously, RunCache will trigger a background refresh using the source function
3. Once the refresh completes, the cache is updated with fresh data
4. Subsequent calls will get the new data

This pattern prevents cache stampedes and ensures users always get a response quickly.

## Handling Refetch Failures

When using `autoRefetch`, it's important to handle potential failures in the background refresh:

```typescript
// Global refetch failure event
RunCache.onRefetchFailure((event) => {
  console.error(`Failed to refresh cache key ${event.key}: ${event.error.message}`);
});

// Specific key refetch failure
RunCache.onKeyRefetchFailure("critical-stats", (event) => {
  console.error(`Critical stats refresh failed: ${event.error.message}`);
  
  // Implement retry logic or fallback mechanism
  setTimeout(() => RunCache.refetch("critical-stats"), 30000); // Retry after 30 seconds
});
```

## TTL Best Practices

Here are some best practices for effectively using TTL:

1. **Match TTL to data volatility**:
   - Use shorter TTL for frequently changing data
   - Use longer TTL for stable data
   - Consider the consequences of serving stale data

2. **Use appropriate time units**:
   - Define constants for common TTL values
   - Use clear variable names to indicate time units

3. **Consider access patterns**:
   - For frequently accessed data, longer TTL improves performance
   - For infrequently accessed data, shorter TTL keeps memory usage down

4. **Implement staggered expiration**:
   - Add small random variations to TTL to prevent mass expiration
   ```typescript
   const baseTTL = 3600000; // 1 hour
   const jitter = Math.floor(Math.random() * 300000); // 0-5 minutes
   await RunCache.set({ key: 'data', value: 'value', ttl: baseTTL + jitter });
   ```

5. **Use `autoRefetch` for critical data**:
   - Ensures users always get a response
   - Prevents cache stampedes
   - Maintains data freshness in the background

## Advanced TTL Scenarios

### Sliding Expiration

RunCache doesn't directly support sliding expiration (extending TTL on access), but you can implement it manually:

```typescript
async function getWithSlidingExpiration(key, slidingTTL) {
  const value = await RunCache.get(key);
  if (value) {
    // Reset the TTL by setting the same value again
    await RunCache.set({ key, value, ttl: slidingTTL });
  }
  return value;
}

// Usage
const userData = await getWithSlidingExpiration('user:1', 3600000);
```

### Conditional Expiration

You can implement conditional expiration by checking certain conditions before refreshing:

```typescript
async function getWithConditionalRefresh(key) {
  const value = await RunCache.get(key);
  
  // If value exists but some condition requires refresh
  if (value && shouldRefreshData(JSON.parse(value))) {
    await RunCache.refetch(key);
    return await RunCache.get(key);
  }
  
  return value;
}

function shouldRefreshData(data) {
  // Custom logic to determine if data needs refresh
  return data.version < CURRENT_VERSION;
}
```

## Next Steps

Now that you understand TTL and expiration, explore these related topics:

- [Automatic Refetching](./auto-refetch.md) - Learn more about background refresh functionality
- [Source Functions](./source-functions.md) - Dive deeper into source functions
- [Event System](../advanced/event-system.md) - Understand how to use events for cache monitoring
- [Resource Management](../advanced/resource-management.md) - Learn about memory management and cleanup 