# Source Functions

Source functions are a powerful feature in RunCache that allow you to dynamically generate cache values. This guide explains how to use source functions effectively in your applications.

## Understanding Source Functions

A source function is a function that generates a value for a cache entry. Instead of providing a static value when setting a cache entry, you provide a function that RunCache will call to generate the value when needed.

Key benefits of using source functions:

- **Lazy Loading**: Values are only generated when actually needed
- **Automatic Serialization**: No need to manually stringify the result
- **Error Handling**: RunCache handles errors from the source function
- **Automatic Refresh**: Can be combined with TTL and autoRefetch

## Basic Usage

To use a source function, provide it as the `sourceFn` parameter when setting a cache entry:

```typescript
await RunCache.set({
  key: 'user-profile',
  sourceFn: async () => {
    const response = await fetch('https://api.example.com/users/1');
    const data = await response.json();
    return JSON.stringify(data);
  }
});
```

When `RunCache.get('user-profile')` is called for the first time, RunCache will:
1. Execute the source function
2. Store the returned value in the cache
3. Return the value to the caller

Subsequent calls to `RunCache.get('user-profile')` will return the cached value without calling the source function again.

## Synchronous vs. Asynchronous Source Functions

RunCache supports both synchronous and asynchronous source functions:

### Synchronous Source Functions

```typescript
await RunCache.set({
  key: 'computed-value',
  sourceFn: () => {
    const result = performExpensiveCalculation();
    return JSON.stringify(result);
  }
});
```

### Asynchronous Source Functions

```typescript
await RunCache.set({
  key: 'api-data',
  sourceFn: async () => {
    const response = await fetch('https://api.example.com/data');
    const data = await response.json();
    return JSON.stringify(data);
  }
});
```

Both types of functions are handled appropriately by RunCache.

## Source Functions with TTL

You can combine source functions with TTL (Time-to-Live) to automatically invalidate cache entries after a certain period:

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
1. The first call to `RunCache.get('weather-data')` will execute the source function
2. Subsequent calls within 30 minutes will return the cached value
3. After 30 minutes, the next call will execute the source function again

## Source Functions with Automatic Refetching

For critical data that should always be available, combine source functions with automatic refetching:

```typescript
await RunCache.set({
  key: 'stock-prices',
  sourceFn: async () => {
    const response = await fetch('https://api.example.com/stocks');
    const data = await response.json();
    return JSON.stringify(data);
  },
  ttl: 60000, // 1 minute
  autoRefetch: true
});
```

With `autoRefetch: true`:
1. When the TTL expires, the next `get()` call will return the stale data immediately
2. Simultaneously, RunCache will trigger a background refresh using the source function
3. Once the refresh completes, the cache is updated with fresh data

## Manually Refreshing Source Function Values

You can manually trigger a refresh for any cache entry with a source function:

```typescript
await RunCache.refetch('stock-prices');
```

This will:
1. Execute the source function again
2. Update the cache with the new value
3. Reset the TTL timer (if applicable)

## Error Handling in Source Functions

If a source function throws an error, RunCache handles it appropriately:

### Initial Cache Miss

If the source function throws an error on initial cache miss:
1. The error is propagated to the caller
2. No cache entry is created

```typescript
try {
  await RunCache.get('api-data'); // First call, source function throws
} catch (error) {
  console.error('Failed to fetch API data:', error);
}
```

### Refetch Failures

If the source function throws during an automatic refetch:
1. The stale value remains in the cache
2. A refetch failure event is triggered
3. The error doesn't propagate to the caller of `get()`

```typescript
// Register for refetch failure events
RunCache.onRefetchFailure((event) => {
  console.error(`Failed to refresh ${event.key}:`, event.error);
  
  // Implement retry logic
  setTimeout(() => RunCache.refetch(event.key), 30000);
});
```

## Advanced Source Function Patterns

### Parameterized Source Functions

You can create source functions that use parameters from the cache key:

```typescript
// Helper function to create parameterized source functions
function createUserProfileSource(userId) {
  return async () => {
    const response = await fetch(`https://api.example.com/users/${userId}`);
    const data = await response.json();
    return JSON.stringify(data);
  };
}

// Set cache entries with different parameters
await RunCache.set({
  key: 'user:1:profile',
  sourceFn: createUserProfileSource(1)
});

await RunCache.set({
  key: 'user:2:profile',
  sourceFn: createUserProfileSource(2)
});
```

### Caching Function Results

You can create a wrapper to automatically cache function results:

```typescript
async function cachedFetch(url, options = {}) {
  const cacheKey = `fetch:${url}`;
  
  // Try to get from cache first
  const cachedResponse = await RunCache.get(cacheKey);
  if (cachedResponse) {
    return JSON.parse(cachedResponse);
  }
  
  // Set up cache with source function
  await RunCache.set({
    key: cacheKey,
    sourceFn: async () => {
      const response = await fetch(url, options);
      const data = await response.json();
      return JSON.stringify(data);
    },
    ttl: options.ttl || 60000 // Default 1 minute TTL
  });
  
  // Get the newly cached value
  const freshResponse = await RunCache.get(cacheKey);
  return JSON.parse(freshResponse);
}

// Usage
const userData = await cachedFetch('https://api.example.com/users/1', { ttl: 300000 });
```

### Source Functions with Dependencies

You can create source functions that depend on other cached values:

```typescript
// Primary data
await RunCache.set({
  key: 'user:1:profile',
  sourceFn: async () => {
    const response = await fetch('https://api.example.com/users/1');
    const data = await response.json();
    return JSON.stringify(data);
  }
});

// Dependent data
await RunCache.set({
  key: 'user:1:recommendations',
  sourceFn: async () => {
    // Get the user profile from cache first
    const profileJson = await RunCache.get('user:1:profile');
    const profile = JSON.parse(profileJson);
    
    // Use profile data to fetch recommendations
    const response = await fetch(`https://api.example.com/recommendations?preferences=${profile.preferences.join(',')}`);
    const recommendations = await response.json();
    return JSON.stringify(recommendations);
  },
  dependencies: ['user:1:profile'] // Will be invalidated when profile changes
});
```

## Best Practices for Source Functions

### 1. Keep Source Functions Pure

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

### 2. Handle Errors Properly

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

### 3. Return Stringified Data

Source functions should always return string values:

```typescript
// Good - returns stringified data
await RunCache.set({
  key: 'user-data',
  sourceFn: async () => {
    const data = await fetchUserData();
    return JSON.stringify(data);
  }
});

// Avoid - returning objects directly
await RunCache.set({
  key: 'user-data',
  sourceFn: async () => {
    return fetchUserData(); // Wrong! Should stringify the result
  }
});
```

### 4. Optimize for Performance

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

### 5. Use Appropriate TTL Values

Set TTL values based on:
- How frequently the underlying data changes
- How critical data freshness is
- Resource constraints of your application

```typescript
// Frequently changing data
await RunCache.set({
  key: 'stock-price',
  sourceFn: () => fetchStockPrice(),
  ttl: 60 * 1000 // 1 minute
});

// Relatively stable data
await RunCache.set({
  key: 'company-info',
  sourceFn: () => fetchCompanyInfo(),
  ttl: 24 * 60 * 60 * 1000 // 1 day
});
```

## Next Steps

Now that you understand source functions, explore these related topics:

- [TTL and Expiration](./ttl-expiration.md) - Learn more about time-to-live functionality
- [Automatic Refetching](./auto-refetch.md) - Dive deeper into background refresh functionality
- [Dependency Tracking](../advanced/dependency-tracking.md) - Learn about relationships between cache entries
- [Event System](../advanced/event-system.md) - Understand how to use events for cache monitoring 