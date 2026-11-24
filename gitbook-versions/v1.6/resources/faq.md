# Frequently Asked Questions

This document addresses common questions about RunCache and provides concise answers to help you understand and use the library more effectively.

## General Questions

### What is RunCache?

RunCache is a lightweight, dependency-free runtime caching library for JavaScript and TypeScript applications. It allows you to cache values in memory with configurable time-to-live (TTL) settings and supports automatic value regeneration through source functions.

### When should I use RunCache?

RunCache is ideal for:
- Caching API responses to reduce network requests
- Storing computed values to improve performance
- Managing application state with expiration policies
- Implementing complex caching patterns with dependencies and tags
- Any scenario where you need a flexible in-memory cache with automatic invalidation

### Is RunCache suitable for production use?

Yes, RunCache is designed for production use with a focus on performance, reliability, and memory efficiency. It includes features like eviction policies, resource management, and comprehensive error handling.

### Does RunCache work in both browser and Node.js environments?

Yes, RunCache works in both browser and Node.js environments. It has no external dependencies and is designed to be platform-agnostic.

## Technical Questions

### How does RunCache compare to other caching libraries?

RunCache differentiates itself with:
- Zero dependencies
- Comprehensive event system
- Dependency tracking between cache entries
- Tag-based invalidation
- Advanced pattern matching
- TypeScript support
- Automatic refetching capabilities
- Persistent storage options

### Does RunCache support server-side rendering (SSR)?

Yes, RunCache works with server-side rendering. For optimal use in SSR environments:
1. Use separate cache instances for each request
2. Configure appropriate TTL values
3. Clear sensitive data before sending responses
4. Consider using the `shutdown()` method when a request completes

### How does automatic refetching work?

When you set a cache entry with `autoRefetch: true`:
1. The cache entry is created with a normal TTL
2. When the TTL expires, the next `get()` call will:
   - Return the stale value immediately
   - Trigger a background refresh using the source function
   - Update the cache with the fresh value when available
3. Subsequent calls will get the refreshed value

This prevents cache stampedes and ensures your application remains responsive.

### Is RunCache thread-safe?

In Node.js, RunCache is designed to work within a single thread/process. If you're using multiple processes (like with PM2 or worker threads), each process will have its own separate cache instance.

For multi-process scenarios, consider using:
- External shared caching (like Redis)
- The storage adapters feature to maintain some persistence

### Does RunCache support distributed caching?

RunCache is primarily designed for local in-memory caching. For distributed scenarios:
1. Use RunCache as a local cache layer in front of a distributed cache
2. Implement custom storage adapters that connect to distributed cache systems
3. Use the event system to coordinate cache invalidation across instances

## Performance Questions

### How much memory does RunCache use?

RunCache's memory usage depends on:
- The number of cache entries
- The size of cached values
- Metadata associated with entries (TTL, tags, etc.)

To control memory usage:
1. Configure an appropriate `maxEntries` limit
2. Set eviction policies (LRU or LFU)
3. Use appropriate TTL values
4. Optimize value serialization

### Will RunCache cause memory leaks?

RunCache is designed to prevent memory leaks by:
- Cleaning up expired entries
- Providing eviction policies to limit cache size
- Properly managing timers and event listeners
- Including a `shutdown()` method for complete cleanup

For long-running applications, it's recommended to:
1. Configure appropriate TTL values
2. Set a maximum cache size
3. Monitor memory usage
4. Call `shutdown()` when the application terminates

### How does the eviction policy impact performance?

The eviction policy affects how entries are removed when the cache reaches its maximum size:

- **LRU (Least Recently Used)**: Removes the entries that haven't been accessed for the longest time. This is fast and works well for most use cases.
- **LFU (Least Frequently Used)**: Removes the entries that have been accessed the least number of times. This has slightly more overhead but can be better for certain access patterns.
- **NONE**: No automatic eviction, which means you must manage cache size manually through TTL or explicit deletion.

## Feature-Specific Questions

### How do cache dependencies work?

Dependencies establish relationships between cache entries:

```typescript
// Set up dependencies
await RunCache.set({ key: 'user:1', value: '...' });
await RunCache.set({ 
  key: 'user:1:dashboard', 
  value: '...', 
  dependencies: ['user:1'] 
});

// When the primary entry changes
await RunCache.set({ key: 'user:1', value: 'new value' });
// The dependent entry is automatically invalidated

// Or invalidate explicitly
RunCache.invalidateByDependency('user:1');
```

When a cache entry is updated or invalidated, all entries that depend on it are also invalidated, creating a cascading effect through the dependency chain.

### How does tag-based invalidation differ from dependencies?

- **Tags** are used to group related cache entries for batch invalidation. Multiple entries can have the same tag, and invalidating a tag affects all entries with that tag.
- **Dependencies** establish direct relationships between entries. When one entry changes, all dependent entries are invalidated.

Use tags for broader grouping and dependencies for direct relationships.

### Can I use RunCache with React/Vue/Angular?

Yes, RunCache works well with all major frontend frameworks:

**React Example:**
```typescript
import { useState, useEffect } from 'react';
import { RunCache } from 'run-cache';

function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      setLoading(true);
      const cacheKey = `user:${userId}`;
      
      // Try to get from cache
      let userData = await RunCache.get(cacheKey);
      
      if (!userData) {
        // Cache miss, fetch from API
        const response = await fetch(`/api/users/${userId}`);
        userData = await response.text(); // Already stringified
        
        // Store in cache
        await RunCache.set({
          key: cacheKey,
          value: userData,
          ttl: 300000 // 5 minutes
        });
      }
      
      setUser(JSON.parse(userData));
      setLoading(false);
    }
    
    loadUser();
    
    // Set up event listener for cache changes
    const handleRefresh = () => loadUser();
    RunCache.onKeyRefetch(`user:${userId}`, handleRefresh);
    
    return () => {
      RunCache.clearEventListeners({
        event: 'refetch',
        key: `user:${userId}`
      });
    };
  }, [userId]);
  
  if (loading) return <div>Loading...</div>;
  return <div>{user.name}</div>;
}
```

### How do I implement cache prefetching/warming?

```typescript
// Cache warming function
async function warmCache() {
  console.log('Warming cache...');
  
  // Check if data already exists in cache
  const hasConfig = await RunCache.has('app:config');
  const hasGlobalData = await RunCache.has('app:global-data');
  
  // Only fetch what's missing
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

### Can I encrypt cached data?

Yes, using middleware:

```typescript
import { RunCache } from 'run-cache';
import { encrypt, decrypt } from './your-crypto-lib';

// Add encryption middleware
RunCache.use(async (value, context, next) => {
  if (context.operation === 'set' && value) {
    // Encrypt value before storing in cache
    return next(encrypt(value));
  } else if (context.operation === 'get' || context.operation === 'refetch') {
    // Decrypt value after retrieving from cache
    const encrypted = await next(value);
    return encrypted ? decrypt(encrypted) : undefined;
  }
  return next(value);
});
```

## Troubleshooting

### Why is my cache entry not being stored?

Common issues include:
1. Not providing a required parameter (key or value/sourceFn)
2. Exception in source function
3. Incorrect value format (must be a string)
4. Exceeding maximum cache size with eviction policy

Solution:
```typescript
// Enable debug logging
RunCache.configure({ debug: true });

// Check for errors in source function
try {
  await RunCache.set({
    key: 'data',
    sourceFn: async () => {
      const data = await fetchData();
      return JSON.stringify(data); // Ensure you return a string
    }
  });
} catch (error) {
  console.error('Error setting cache:', error);
}
```

### Why is my cache entry expiring too soon?

Common causes:
1. TTL value in wrong units (seconds vs milliseconds)
2. Clock drift in distributed systems
3. Incorrect calculation of TTL value

Solution:
```typescript
// Ensure TTL is in milliseconds
const ONE_HOUR_MS = 60 * 60 * 1000; // 3,600,000 ms

await RunCache.set({
  key: 'data',
  value: 'value',
  ttl: ONE_HOUR_MS // Clearly in milliseconds
});

// Monitor expiration
RunCache.onKeyExpiry('data', (event) => {
  console.log(`Data expired at ${new Date().toISOString()}`);
  console.log(`TTL was ${event.ttl}ms, set at ${new Date(event.updatedAt).toISOString()}`);
});
```

### Why aren't my event listeners firing?

Common issues:
1. Using incorrect event name
2. Listener registered after the event occurred
3. Pattern matching typo
4. Event listener was cleared

Solution:
```typescript
import { RunCache, EVENT } from 'run-cache';

// Use the correct event type
RunCache.onExpiry((event) => {
  console.log(`Key expired: ${event.key}`);
});

// For specific key patterns, ensure correct syntax
RunCache.onKeyExpiry('user:*', (event) => {
  console.log(`User data expired: ${event.key}`);
});

// Keep reference to handler for manual removal
const handler = (event) => console.log(event);
RunCache.onRefetch(handler);

// Later, if needed:
RunCache.clearEventListeners({
  event: EVENT.REFETCH,
  handler: handler
});
```

## Best Practices

### What's the best way to structure cache keys?

Follow these guidelines:
1. Use consistent naming conventions
2. Use hierarchical structures with delimiters
3. Include entity type and identifier
4. Avoid special characters that might conflict with pattern matching

Recommended format: `entityType:identifier:attribute`

Examples:
- `user:1234:profile`
- `product:xyz:details`
- `api:users:list:page=1`

### How should I handle errors in source functions?

Best practices:
1. Always include try/catch in source functions
2. Log errors with context
3. Return fallback values when appropriate
4. Register refetch failure listeners

```typescript
// Good source function with error handling
await RunCache.set({
  key: 'api-data',
  sourceFn: async () => {
    try {
      const response = await fetch('https://api.example.com/data');
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      console.error('Failed to fetch API data:', error);
      throw error; // Rethrow to trigger refetch failure event
    }
  },
  ttl: 300000
});

// Handle refetch failures
RunCache.onKeyRefetchFailure('api-data', (event) => {
  console.error('API data refresh failed:', event.error);
  notifyAdmins('API data refresh failed');
});
```

### Should I use RunCache for session data?

RunCache can be appropriate for session data with some considerations:
1. Set appropriate TTL values that align with session timeouts
2. Use tags to group session data for easy invalidation
3. Consider security implications of storing sensitive data
4. Use middleware for encryption if needed
5. Implement proper cleanup on logout

```typescript
// Store session data
await RunCache.set({
  key: `session:${sessionId}:user`,
  value: JSON.stringify(userData),
  ttl: 30 * 60 * 1000, // 30 minutes
  tags: [`session:${sessionId}`, 'user-sessions']
});

// On logout, invalidate all session data
RunCache.invalidateByTag(`session:${sessionId}`);
```

## More Help

### Where can I get support?

- GitHub Issues: [RunCache GitHub Repository](https://github.com/example/run-cache/issues)
- Documentation: [RunCache Documentation](https://example.github.io/run-cache)
- Community Discussions: [RunCache Discussions](https://github.com/example/run-cache/discussions)

### How can I contribute to RunCache?

We welcome contributions! Check our [Contributing Guide](./contributing.md) for details on:
- Setting up the development environment
- Coding standards
- Pull request process
- Feature request guidelines
- Bug reporting 