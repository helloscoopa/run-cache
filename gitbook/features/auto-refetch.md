# Automatic Refetching

Automatic refetching is a powerful feature in RunCache that allows cache entries to be refreshed in the background when they expire. This guide explains how to use automatic refetching and its benefits for your applications.

## Understanding Automatic Refetching

When a cache entry with `autoRefetch: true` expires:

1. The next `get()` call will return the stale value immediately
2. Simultaneously, RunCache triggers a background refresh using the source function
3. Once the refresh completes, the cache is updated with fresh data
4. Subsequent calls will get the new data

This approach provides several benefits:
- **Zero Wait Time**: Users never wait for cache refreshes
- **Prevents Cache Stampedes**: Only one refresh happens regardless of concurrent requests
- **Always Fresh Data**: Cache entries are automatically kept up-to-date
- **Resilience**: If refresh fails, stale data is still available

## Setting Up Automatic Refetching

To enable automatic refetching, you need to:
1. Provide a `sourceFn` to generate the cache value
2. Set a `ttl` (Time-to-Live) value
3. Set `autoRefetch: true`

```typescript
await RunCache.set({
  key: 'weather-data',
  sourceFn: async () => {
    const response = await fetch('https://api.weather.com/current');
    const data = await response.json();
    return data;
  },
  ttl: 5 * 60 * 1000, // 5 minutes
  autoRefetch: true
});
```

## How It Works Behind the Scenes

Let's walk through what happens with automatic refetching:

1. **Initial Cache Miss**:
   - First `get('weather-data')` finds no cache entry
   - RunCache calls the `sourceFn` to fetch data
   - User waits for this initial fetch
   - Result is stored in cache with TTL

2. **Cache Hit (Before Expiry)**:
   - Subsequent `get('weather-data')` within TTL period
   - RunCache returns cached value immediately
   - No source function call occurs

3. **After TTL Expires**:
   - Next `get('weather-data')` after TTL expired
   - RunCache returns stale value immediately
   - RunCache triggers background refresh using `sourceFn`
   - Cache is updated when refresh completes
   - User experiences no delay

## Monitoring Refetch Events

RunCache provides events to monitor automatic refetching:

```typescript
// Global refetch event
await RunCache.onRefetch((event) => {
  console.log(`Cache key ${event.key} was refreshed at ${new Date().toISOString()}`);
});

// Specific key refetch
await RunCache.onKeyRefetch("weather-data", (event) => {
  console.log(`Weather data was refreshed`);
});

// Pattern-based refetch events
await RunCache.onKeyRefetch("user:*:profile", (event) => {
  console.log(`User profile ${event.key} was refreshed`);
});
```

## Handling Refetch Failures

If a background refresh fails, RunCache provides events to handle the failure:

```typescript
// Global refetch failure event
await RunCache.onRefetchFailure((event) => {
  console.error(`Failed to refresh cache key ${event.key}: ${event.error}`);
});

// Specific key refetch failure
await RunCache.onKeyRefetchFailure("weather-data", (event) => {
  console.error(`Weather data refresh failed: ${event.error}`);

  // Implement retry logic
  setTimeout(() => RunCache.refetch("weather-data"), 30000); // Retry after 30 seconds
});
```

When a refetch fails:
1. The stale data remains in the cache
2. The failure event is triggered
3. No automatic retry is attempted (you must implement retry logic)

## Manual Refetching

You can also manually trigger a refresh for any cache entry with a source function:

```typescript
// Manually refresh a specific entry
await RunCache.refetch('weather-data');

// Refresh multiple entries using a pattern
await RunCache.refetch('user:*:profile');
```

Manual refetching is useful for:
- Forcing a refresh before the TTL expires
- Retrying after a failed automatic refresh
- Refreshing data after related data changes

`refetch()` resolves to `true` when the new value was stored. It resolves to `false` if the entry changed while the source function was running, for example because it was deleted, invalidated, flushed or overwritten with `set()`. In that case the result is discarded, so a refetch never brings back an entry that was removed, and never overwrites a newer value.

## Best Practices for Automatic Refetching

### 1. Use for Critical Data Only

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
  ttl: 30 * 60 * 1000,
  // No autoRefetch as it's less critical
});
```

### 2. Consider Resource Usage

Each automatic refetch consumes resources:
- Network bandwidth for API calls
- CPU time for processing
- Memory for storing results

For high-traffic applications, be selective about which entries use automatic refetching.

### 3. Set Appropriate TTL Values

The TTL value determines how often automatic refetches occur:
- Too short: Excessive refreshes waste resources
- Too long: Data becomes stale

```typescript
// Frequently changing data
await RunCache.set({
  key: 'stock-prices',
  sourceFn: () => fetchStockPrices(),
  ttl: 60 * 1000, // 1 minute
  autoRefetch: true
});

// Relatively stable data
await RunCache.set({
  key: 'product-catalog',
  sourceFn: () => fetchProductCatalog(),
  ttl: 60 * 60 * 1000, // 1 hour
  autoRefetch: true
});
```

### 4. Implement Proper Error Handling

Always implement error handling for refetch failures:

```typescript
// Attempts per key; RunCache events carry no custom metadata
const retryCounts = new Map<string, number>();

await RunCache.onRefetchFailure((event) => {
  // Log the error
  console.error(`Refetch failed for ${event.key}:`, event.error);

  // Implement exponential backoff retry
  const retryCount = (retryCounts.get(event.key) ?? 0) + 1;
  retryCounts.set(event.key, retryCount);
  const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30 seconds

  setTimeout(() => {
    RunCache.refetch(event.key)
      .then((ok) => { if (ok) retryCounts.delete(event.key); })
      .catch(() => { /* reported again through onRefetchFailure */ });
  }, delay);
});
```

### 5. Track Refetch Statistics

Cache entries have no metadata option, and refetch events only carry the entry's key, value, TTL and timestamps. Track anything else yourself, keyed by cache key:

```typescript
const refreshStats = new Map<string, { refreshCount: number; lastRefreshedAt: number }>();

await RunCache.set({
  key: 'api-data',
  sourceFn: () => fetchApiData(),
  ttl: 300000,
  autoRefetch: true
});

await RunCache.onRefetch((event) => {
  const stats = refreshStats.get(event.key) ?? { refreshCount: 0, lastRefreshedAt: 0 };
  stats.refreshCount++;
  stats.lastRefreshedAt = event.updatedAt;
  refreshStats.set(event.key, stats);
});
```

## Advanced Patterns

### Cascading Refreshes

You can implement cascading refreshes using dependencies. Each automatic refetch of the primary entry invalidates its dependents:

```typescript
// Primary data
await RunCache.set({
  key: 'user:1:profile',
  sourceFn: () => fetchUserProfile(1),
  ttl: 300000,
  autoRefetch: true
});

// Dependent data
await RunCache.set({
  key: 'user:1:recommendations',
  sourceFn: () => fetchUserRecommendations(1),
  ttl: 300000,
  autoRefetch: true,
  dependencies: ['user:1:profile'] // Invalidated each time the profile is refetched
});
```

Invalidated entries are removed, not refetched, even when they have their own `sourceFn` and `autoRefetch`: set `user:1:recommendations` again the next time you need it, or from a `dependency_invalidation` listener.

### Conditional Refetching

You can implement conditional refetching by checking certain conditions:

```typescript
// Custom refetch logic
await RunCache.onKeyExpiry('conditional-data', async (event) => {
  const shouldRefresh = await checkIfRefreshNeeded(event.key);

  if (shouldRefresh) {
    await RunCache.refetch(event.key);
  } else {
    console.log('Skipping refresh based on condition');
  }
});
```

## Next Steps

Now that you understand automatic refetching, explore these related topics:

- [TTL and Expiration](./ttl-expiration.md) - Learn more about time-to-live functionality
- [Source Functions](./source-functions.md) - Dive deeper into source functions
- [Event System](../advanced/event-system.md) - Understand how to use events for cache monitoring
- [Dependency Tracking](../advanced/dependency-tracking.md) - Learn about relationships between cache entries 