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

Each event type has a corresponding event object with specific properties:

### ExpiryEvent

Triggered when a cache entry expires.

```typescript
interface ExpiryEvent {
  key: string;        // The key of the expired entry
  ttl: number;        // The TTL value in milliseconds
  updatedAt: number;  // Timestamp when the entry was last updated
  metadata?: any;     // Optional custom metadata associated with the entry
}
```

### RefetchEvent

Triggered when a cache entry is refreshed.

```typescript
interface RefetchEvent {
  key: string;        // The key of the refreshed entry
  metadata?: any;     // Optional custom metadata associated with the entry
}
```

### RefetchFailureEvent

Triggered when a cache refresh operation fails.

```typescript
interface RefetchFailureEvent {
  key: string;        // The key of the entry that failed to refresh
  error: Error;       // The error that occurred during refresh
  metadata?: any;     // Optional custom metadata associated with the entry
}
```

### TagInvalidationEvent

Triggered when a cache entry is invalidated by tag.

```typescript
interface TagInvalidationEvent {
  key: string;        // The key of the invalidated entry
  tag: string;        // The tag that caused the invalidation
  metadata?: any;     // Optional custom metadata associated with the entry
}
```

### DependencyInvalidationEvent

Triggered when a cache entry is invalidated due to a dependency.

```typescript
interface DependencyInvalidationEvent {
  key: string;        // The key of the invalidated entry
  dependencyKey: string; // The key of the dependency that caused the invalidation
  metadata?: any;     // Optional custom metadata associated with the entry
}
```

## Global Event Listeners

Global event listeners are triggered for all cache entries that match the specified event type.

### onExpiry

Registers a callback for all expiry events.

```typescript
RunCache.onExpiry(callback: (event: ExpiryEvent) => void): void
```

**Parameters:**
- `callback`: Function to call when any entry expires

**Example:**

```typescript
RunCache.onExpiry((event) => {
  console.log(`Cache key ${event.key} expired at ${new Date(event.updatedAt + event.ttl).toISOString()}`);
});
```

### onRefetch

Registers a callback for all refetch events.

```typescript
RunCache.onRefetch(callback: (event: RefetchEvent) => void): void
```

**Parameters:**
- `callback`: Function to call when any entry is refreshed

**Example:**

```typescript
RunCache.onRefetch((event) => {
  console.log(`Cache key ${event.key} was refreshed at ${new Date().toISOString()}`);
});
```

### onRefetchFailure

Registers a callback for all refetch failure events.

```typescript
RunCache.onRefetchFailure(callback: (event: RefetchFailureEvent) => void): void
```

**Parameters:**
- `callback`: Function to call when any refresh fails

**Example:**

```typescript
RunCache.onRefetchFailure((event) => {
  console.error(`Failed to refresh cache key ${event.key}:`, event.error.message);
});
```

### onTagInvalidation

Registers a callback for all tag invalidation events.

```typescript
RunCache.onTagInvalidation(callback: (event: TagInvalidationEvent) => void): void
```

**Parameters:**
- `callback`: Function to call when any entry is invalidated by tag

**Example:**

```typescript
RunCache.onTagInvalidation((event) => {
  console.log(`Cache key ${event.key} was invalidated by tag: ${event.tag}`);
});
```

### onDependencyInvalidation

Registers a callback for all dependency invalidation events.

```typescript
RunCache.onDependencyInvalidation(callback: (event: DependencyInvalidationEvent) => void): void
```

**Parameters:**
- `callback`: Function to call when any entry is invalidated by dependency

**Example:**

```typescript
RunCache.onDependencyInvalidation((event) => {
  console.log(`Cache key ${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

## Key-Specific Event Listeners

Key-specific event listeners are triggered only for cache entries with keys that match the specified key or pattern.

### onKeyExpiry

Registers a callback for expiry events for a specific key or pattern.

```typescript
RunCache.onKeyExpiry(key: string, callback: (event: ExpiryEvent) => void): void
```

**Parameters:**
- `key`: The key or pattern to watch
- `callback`: Function to call when matching entries expire

**Example:**

```typescript
// Specific key
RunCache.onKeyExpiry("api-data", (event) => {
  console.log(`API data cache expired`);
});

// Pattern matching
RunCache.onKeyExpiry("user:*:profile", (event) => {
  console.log(`User profile ${event.key} expired`);
});
```

### onKeyRefetch

Registers a callback for refetch events for a specific key or pattern.

```typescript
RunCache.onKeyRefetch(key: string, callback: (event: RefetchEvent) => void): void
```

**Parameters:**
- `key`: The key or pattern to watch
- `callback`: Function to call when matching entries are refreshed

**Example:**

```typescript
// Specific key
RunCache.onKeyRefetch("weather-data", (event) => {
  console.log(`Weather data was refreshed`);
});

// Pattern matching
RunCache.onKeyRefetch("api:*:data", (event) => {
  console.log(`API data ${event.key} was refreshed`);
});
```

### onKeyRefetchFailure

Registers a callback for refetch failure events for a specific key or pattern.

```typescript
RunCache.onKeyRefetchFailure(key: string, callback: (event: RefetchFailureEvent) => void): void
```

**Parameters:**
- `key`: The key or pattern to watch
- `callback`: Function to call when matching refreshes fail

**Example:**

```typescript
// Specific key
RunCache.onKeyRefetchFailure("api-data", (event) => {
  console.error(`API data refresh failed:`, event.error.message);
});

// Pattern matching
RunCache.onKeyRefetchFailure("api:*", (event) => {
  console.error(`API data ${event.key} refresh failed:`, event.error.message);
});
```

### onKeyTagInvalidation

Registers a callback for tag invalidation events for a specific key or pattern.

```typescript
RunCache.onKeyTagInvalidation(key: string, callback: (event: TagInvalidationEvent) => void): void
```

**Parameters:**
- `key`: The key or pattern to watch
- `callback`: Function to call when matching entries are invalidated by tag

**Example:**

```typescript
// Specific key
RunCache.onKeyTagInvalidation("user:1:profile", (event) => {
  console.log(`User profile was invalidated by tag: ${event.tag}`);
});

// Pattern matching
RunCache.onKeyTagInvalidation("user:*:profile", (event) => {
  console.log(`User profile ${event.key} was invalidated by tag: ${event.tag}`);
});
```

### onKeyDependencyInvalidation

Registers a callback for dependency invalidation events for a specific key or pattern.

```typescript
RunCache.onKeyDependencyInvalidation(key: string, callback: (event: DependencyInvalidationEvent) => void): void
```

**Parameters:**
- `key`: The key or pattern to watch
- `callback`: Function to call when matching entries are invalidated by dependency

**Example:**

```typescript
// Specific key
RunCache.onKeyDependencyInvalidation("dashboard:main", (event) => {
  console.log(`Main dashboard was invalidated due to dependency on: ${event.dependencyKey}`);
});

// Pattern matching
RunCache.onKeyDependencyInvalidation("dashboard:*", (event) => {
  console.log(`Dashboard ${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

## Managing Event Listeners

### clearEventListeners

Removes event listeners based on the specified options.

```typescript
RunCache.clearEventListeners(options?: {
  event?: EVENT;
  key?: string;
  handler?: Function;
}): void
```

**Parameters:**
- `options?`: Options to specify which listeners to remove
  - `event?`: The event type to remove listeners for
  - `key?`: The key or pattern to remove listeners for
  - `handler?`: The specific handler function to remove

**Examples:**

```typescript
// Remove all event listeners
RunCache.clearEventListeners();

// Remove all expiry event listeners
RunCache.clearEventListeners({
  event: EVENT.EXPIRE
});

// Remove all listeners for a specific key
RunCache.clearEventListeners({
  key: "api-data"
});

// Remove specific event listeners for a key
RunCache.clearEventListeners({
  event: EVENT.REFETCH,
  key: "api-data"
});

// Remove a specific handler
const handler = (event) => console.log(event);
RunCache.onExpiry(handler);
// Later:
RunCache.clearEventListeners({
  event: EVENT.EXPIRE,
  handler: handler
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

## Practical Event System Use Cases

### 1. Logging and Monitoring

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

## Next Steps

- [RunCache API](./run-cache.md) - Learn about the main RunCache API
- [Storage Adapters](./storage-adapters.md) - Understand persistent storage options
- [Types](./types.md) - Explore TypeScript type definitions
- [Event System](../advanced/event-system.md) - Learn more about using events in your application 