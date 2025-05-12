# Event System

RunCache provides a comprehensive event system that allows you to monitor and respond to various cache lifecycle events. This guide explains how to use the event system effectively in your applications.

## Understanding the Event System

The event system allows you to:
- Monitor cache operations like expiration, refetching, and invalidation
- Execute custom logic when specific events occur
- Implement logging, analytics, and debugging
- Build reactive systems that respond to cache changes

RunCache supports both global event listeners (for all keys) and key-specific listeners (for specific keys or patterns).

## Available Event Types

RunCache provides several event types you can subscribe to:

| Event Type | Description | Event Object Properties |
|------------|-------------|------------------------|
| `EXPIRE` | Triggered when a cache entry expires | `key`, `ttl`, `updatedAt` |
| `REFETCH` | Triggered when a cache entry is refreshed | `key`, `metadata` |
| `REFETCH_FAILURE` | Triggered when a cache refresh fails | `key`, `error`, `metadata` |
| `TAG_INVALIDATION` | Triggered when a cache entry is invalidated by tag | `key`, `tag` |
| `DEPENDENCY_INVALIDATION` | Triggered when a cache entry is invalidated by dependency | `key`, `dependencyKey` |

## Global Event Listeners

Global event listeners are triggered for all cache entries that match the specified event type:

### Expiry Events

```typescript
// Listen for all expiry events
RunCache.onExpiry((event) => {
  console.log(`Cache key ${event.key} expired at ${new Date(event.updatedAt + event.ttl).toISOString()}`);
});
```

### Refetch Events

```typescript
// Listen for all successful refetch events
RunCache.onRefetch((event) => {
  console.log(`Cache key ${event.key} was refreshed at ${new Date().toISOString()}`);
});

// Listen for all refetch failure events
RunCache.onRefetchFailure((event) => {
  console.error(`Failed to refresh cache key ${event.key}:`, event.error.message);
});
```

### Tag Invalidation Events

```typescript
// Listen for all tag invalidation events
RunCache.onTagInvalidation((event) => {
  console.log(`Cache key ${event.key} was invalidated by tag: ${event.tag}`);
});
```

### Dependency Invalidation Events

```typescript
// Listen for all dependency invalidation events
RunCache.onDependencyInvalidation((event) => {
  console.log(`Cache key ${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

## Key-Specific Event Listeners

Key-specific event listeners are triggered only for cache entries with keys that match the specified key or pattern:

### Key-Specific Expiry Events

```typescript
// Listen for expiry of a specific key
RunCache.onKeyExpiry("api-data", (event) => {
  console.log(`API data cache expired`);
});

// Listen for expiry of keys matching a pattern
RunCache.onKeyExpiry("user:*:profile", (event) => {
  console.log(`User profile ${event.key} expired`);
});
```

### Key-Specific Refetch Events

```typescript
// Listen for refetch of a specific key
RunCache.onKeyRefetch("weather-data", (event) => {
  console.log(`Weather data was refreshed`);
});

// Listen for refetch failures of keys matching a pattern
RunCache.onKeyRefetchFailure("api:*", (event) => {
  console.error(`API data ${event.key} refresh failed:`, event.error.message);
});
```

### Key-Specific Tag Invalidation Events

```typescript
// Listen for tag invalidation of keys matching a pattern
RunCache.onKeyTagInvalidation("user:*:profile", (event) => {
  console.log(`User profile ${event.key} was invalidated by tag: ${event.tag}`);
});
```

### Key-Specific Dependency Invalidation Events

```typescript
// Listen for dependency invalidation of a specific key
RunCache.onKeyDependencyInvalidation("dashboard:main", (event) => {
  console.log(`Main dashboard was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

## Managing Event Listeners

### Removing All Event Listeners

To remove all event listeners:

```typescript
// Remove all event listeners
RunCache.clearEventListeners();
```

### Removing Specific Event Listeners

To remove listeners for a specific event type:

```typescript
// Remove all expiry event listeners
RunCache.clearEventListeners({
  event: EVENT.EXPIRE
});
```

### Removing Key-Specific Listeners

To remove listeners for a specific key or pattern:

```typescript
// Remove refetch listeners for a specific key
RunCache.clearEventListeners({
  event: EVENT.REFETCH,
  key: "api-data"
});

// Remove refetch failure listeners for keys matching a pattern
RunCache.clearEventListeners({
  event: EVENT.REFETCH_FAILURE,
  key: "api:*"
});
```

## Practical Event System Use Cases

### 1. Logging and Monitoring

Use events to implement comprehensive logging:

```typescript
// Set up logging for all major events
RunCache.onExpiry((event) => {
  logger.info(`Cache expired: ${event.key}`);
});

RunCache.onRefetch((event) => {
  logger.info(`Cache refreshed: ${event.key}`);
});

RunCache.onRefetchFailure((event) => {
  logger.error(`Cache refresh failed: ${event.key}`, event.error);
});

RunCache.onTagInvalidation((event) => {
  logger.info(`Cache invalidated by tag: ${event.key} (tag: ${event.tag})`);
});

RunCache.onDependencyInvalidation((event) => {
  logger.info(`Cache invalidated by dependency: ${event.key} (depends on: ${event.dependencyKey})`);
});
```

### 2. Implementing Retry Logic

Use events to implement retry logic for failed refetches:

```typescript
// Set up retry logic with exponential backoff
RunCache.onRefetchFailure((event) => {
  const retryCount = (event.metadata?.retryCount || 0) + 1;
  
  if (retryCount <= 3) {
    const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
    console.log(`Retrying ${event.key} in ${delay}ms (attempt ${retryCount})`);
    
    setTimeout(() => {
      RunCache.refetch(event.key, { 
        metadata: { retryCount } 
      });
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
    // Set up event listener for cache refreshes
    RunCache.onKeyRefetch(`user:${userId}:profile`, () => {
      // Update UI when profile is refreshed
      RunCache.get(`user:${userId}:profile`)
        .then(data => data && setProfile(JSON.parse(data)));
    });
    
    // Initial data fetch
    RunCache.get(`user:${userId}:profile`)
      .then(data => data && setProfile(JSON.parse(data)));
    
    // Clean up listener on unmount
    return () => {
      RunCache.clearEventListeners({
        event: EVENT.REFETCH,
        key: `user:${userId}:profile`
      });
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

RunCache.onExpiry(() => metrics.expiryCount++);
RunCache.onRefetch(() => metrics.refetchCount++);
RunCache.onRefetchFailure(() => metrics.refetchFailureCount++);
RunCache.onTagInvalidation(() => metrics.tagInvalidationCount++);
RunCache.onDependencyInvalidation(() => metrics.dependencyInvalidationCount++);

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
RunCache.onKeyRefetch('user:*:profile', async (event) => {
  const userId = event.key.split(':')[1];
  
  // Refresh related data
  await RunCache.refetch(`user:${userId}:recommendations`);
  await RunCache.refetch(`user:${userId}:activity`);
});
```

## Event Metadata

You can attach custom metadata to cache entries, which will be included in event objects:

```typescript
// Set cache entry with metadata
await RunCache.set({
  key: 'api-data',
  value: JSON.stringify({ results: [...] }),
  metadata: {
    source: 'external-api',
    version: '1.0',
    timestamp: Date.now()
  }
});

// Access metadata in event handlers
RunCache.onKeyExpiry('api-data', (event) => {
  console.log(`API data expired. Source: ${event.metadata.source}, Version: ${event.metadata.version}`);
});
```

## Best Practices for Event Handling

### 1. Keep Event Handlers Lightweight

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

### 2. Handle Errors in Event Handlers

Always handle errors in event handlers to prevent unhandled exceptions:

```typescript
// Good - error handling
RunCache.onRefetch((event) => {
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
RunCache.onKeyExpiry('*', (event) => {
  // This will run for EVERY expiry
});

// Better - more specific pattern
RunCache.onKeyExpiry('api:*', (event) => {
  // This will only run for API-related expirations
});
```

### 4. Clean Up Event Listeners

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

### 5. Avoid Circular Event Handling

Be careful not to create circular event handling patterns:

```typescript
// Dangerous - potential circular handling
RunCache.onKeyRefetch('data-a', () => {
  RunCache.refetch('data-b');
});

RunCache.onKeyRefetch('data-b', () => {
  RunCache.refetch('data-a'); // Creates a loop!
});
```

## Next Steps

Now that you understand the event system, explore these related topics:

- [Tag-based Invalidation](./tag-invalidation.md) - Learn about invalidating groups of related cache entries
- [Dependency Tracking](./dependency-tracking.md) - Understand how to establish relationships between cache entries
- [Middleware](./middleware.md) - Explore how to intercept and transform cache operations
- [Resource Management](./resource-management.md) - Learn about memory management and cleanup 