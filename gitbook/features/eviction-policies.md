# Eviction Policies

Eviction policies determine how RunCache manages memory usage by automatically removing entries when the cache reaches a defined size limit. This page explains the available policies and how to configure them.

## Available Eviction Policies

RunCache provides three eviction policies:

### NONE (Default)

With this policy, the cache will never automatically evict entries based on size. Entries are only removed when:

- They expire based on their TTL
- They are manually deleted via `delete()` or `flush()`
- The application shuts down

This is the default policy and is suitable for cases where you have full control over the cache size through TTLs or manual management.

### LRU (Least Recently Used)

The LRU policy removes the least recently accessed entries when the cache exceeds its maximum size. This is ideal for cases where recently accessed items are more likely to be accessed again.

When an entry is accessed via `get()` or `has()`, it's marked as recently used. When the cache reaches its maximum size, the entries that haven't been accessed for the longest time are removed first.

### LFU (Least Frequently Used)

The LFU policy removes the least frequently accessed entries when the cache exceeds its maximum size. This is ideal for cases where frequency of access is a better predictor of future access than recency.

Each time an entry is accessed, its access count is incremented. When the cache reaches its maximum size, entries with the lowest access count are removed first. If multiple entries have the same access count, the oldest one is removed.

## Configuring Eviction Policies

You can set the eviction policy and maximum cache size through the `configure()` method:

```typescript
import { RunCache, EvictionPolicy } from 'run-cache';

// Configure the cache with a max size of 100 entries and LRU eviction policy
await RunCache.configure({
  maxSize: 100,
  evictionPolicy: EvictionPolicy.LRU
});
```

### Setting Maximum Size

The `maxSize` parameter determines how many entries the cache can hold before eviction occurs:

```typescript
// Allow up to 500 entries
await RunCache.configure({
  maxSize: 500,
  evictionPolicy: EvictionPolicy.LFU
});
```

If you don't specify a `maxSize`, it defaults to `Infinity`, meaning the cache will grow without bounds (unless you set a policy other than `NONE`).

### Changing Policies at Runtime

You can change the eviction policy at any time:

```typescript
// Start with LRU
await RunCache.configure({
  maxSize: 1000,
  evictionPolicy: EvictionPolicy.LRU
});

// Later, switch to LFU
await RunCache.configure({
  evictionPolicy: EvictionPolicy.LFU
});
```

When changing policies, the cache preserves all access metadata (recency and frequency), so the new policy can make informed decisions about which entries to evict.

## Checking Current Configuration

You can retrieve the current configuration using the `getConfig()` method:

```typescript
const config = await RunCache.getConfig();
console.log(config);
// Output: { maxSize: 100, evictionPolicy: "lru", verbose: false, ... }
```

## How Eviction Works

When a new entry is added to the cache and the cache size exceeds `maxSize`:

1. The eviction policy determines which entries to remove
2. Selected entries are removed from the cache
3. Any intervals associated with those entries are cleared
4. The new entry is added to the cache

Eviction is also checked after configuration changes if the new `maxSize` is smaller than the current cache size.

## Best Practices

- **Choose the right policy for your access patterns:**
  - Use LRU when recent access is the best predictor of future access
  - Use LFU when frequency of access is more important than recency
  - Use NONE when you want full manual control or rely on TTL

- **Set a reasonable `maxSize`:** Too small and you'll have frequent evictions, too large and you may consume too much memory.

- **Monitor evictions:** Enable verbose logging to see when entries are being evicted, which can help tune your cache size.

```typescript
await RunCache.configure({
  verbose: true,
  maxSize: 1000,
  evictionPolicy: EvictionPolicy.LRU
});
```

- **Consider TTL alongside eviction policies:** Even with eviction policies, setting TTLs for entries can help ensure data freshness.

## Next Steps

- Learn about [Tag-based Invalidation](../advanced/tag-invalidation.md) for more control over cache entry lifecycle
- Explore [Dependency Tracking](../advanced/dependency-tracking.md) to establish relationships between cache entries
- Check out [Resource Management](../advanced/resource-management.md) for more on memory usage optimization 