# Basic Usage

This guide covers the fundamental operations and patterns for using RunCache in your applications. After reading this guide, you'll understand how to perform basic caching operations and integrate RunCache into your projects.

## Importing the Library

First, import RunCache in your JavaScript or TypeScript file:

```typescript
import { RunCache } from 'run-cache';
```

## Basic Cache Operations

### Setting Cache Values

The most basic operation is storing a value in the cache:

```typescript
// Store a simple string
await RunCache.set({ key: 'greeting', value: 'Hello, World!' });
```

When working with objects or complex data, you need to stringify them first:

```typescript
// Store a JSON object
const user = { id: 1, name: 'John Doe', email: 'john@example.com' };
await RunCache.set({ key: 'user:1', value: JSON.stringify(user) });
```

### Getting Cache Values

To retrieve values from the cache:

```typescript
// Get a simple string
const greeting = await RunCache.get('greeting');
console.log(greeting); // Output: Hello, World!

// Get and parse a JSON object
const userJson = await RunCache.get('user:1');
if (userJson) {
  const user = JSON.parse(userJson);
  console.log(user.name); // Output: John Doe
}
```

### Checking if a Key Exists

To check if a key exists in the cache (and hasn't expired):

```typescript
const exists = await RunCache.has('greeting');
if (exists) {
  console.log('The greeting is cached');
} else {
  console.log('The greeting is not cached');
}
```

### Deleting Cache Entries

To remove a specific entry from the cache:

```typescript
await RunCache.delete('greeting');
```

### Clearing the Entire Cache

To remove all entries from the cache:

```typescript
await RunCache.flush();
```

## Working with Time-to-Live (TTL)

You can set an expiration time for cache entries using the `ttl` parameter (in milliseconds):

```typescript
// Cache with 5-minute expiration
await RunCache.set({ 
  key: 'temporary-data', 
  value: 'This will expire soon',
  ttl: 5 * 60 * 1000 // 5 minutes in milliseconds
});
```

After the TTL period, the value will be automatically removed from the cache when accessed.

## Using Source Functions

Source functions allow you to generate cache values dynamically. This is particularly useful for API calls or expensive computations:

```typescript
// Define a function that fetches data
async function fetchUserData(userId) {
  console.log(`Fetching data for user ${userId}...`);
  // Simulate API call
  return JSON.stringify({ 
    id: userId, 
    name: `User ${userId}`,
    lastUpdated: new Date().toISOString()
  });
}

// Cache the result of the source function
await RunCache.set({
  key: 'user:2',
  sourceFn: () => fetchUserData(2)
});

// The first time you get the value, it calls fetchUserData
const userData = await RunCache.get('user:2');
console.log(userData); // Output: {"id":2,"name":"User 2","lastUpdated":"..."}

// Subsequent calls use the cached value without calling fetchUserData again
const cachedData = await RunCache.get('user:2');
```

### Benefits of Source Functions

Using source functions provides several advantages:

1. **Lazy Loading**: The function is only called when the value is first requested
2. **Automatic Serialization**: No need to manually stringify the result
3. **Error Handling**: RunCache handles errors from the source function
4. **Automatic Refresh**: Can be combined with TTL and autoRefetch

## Automatic Refetching

You can configure cache entries to automatically refresh when they expire:

```typescript
await RunCache.set({
  key: 'stock-price',
  sourceFn: async () => {
    // Simulate API call
    const price = Math.floor(Math.random() * 1000) / 10;
    return JSON.stringify({ symbol: 'AAPL', price });
  },
  ttl: 60000, // 1 minute
  autoRefetch: true
});

// Even after expiration, get() will return the last value while refreshing in background
const stockPrice = await RunCache.get('stock-price');
```

With `autoRefetch: true`, when the TTL expires, RunCache will:
1. Return the stale value to the caller immediately
2. Trigger a background refresh using the source function
3. Update the cache with the new value

This pattern prevents cache stampedes and ensures users always get a response quickly.

## Working with Patterns

RunCache supports wildcard patterns for operating on multiple related cache keys:

```typescript
// Set multiple related entries
await RunCache.set({ key: 'product:1:name', value: 'Laptop' });
await RunCache.set({ key: 'product:1:price', value: '999.99' });
await RunCache.set({ key: 'product:2:name', value: 'Smartphone' });
await RunCache.set({ key: 'product:2:price', value: '499.99' });

// Get all product names
const names = await RunCache.get('product:*:name');
console.log(names); // Output: ['Laptop', 'Smartphone']

// Delete all data for product 1
await RunCache.delete('product:1:*');
```

Patterns are useful for:
- Batch operations on related cache entries
- Implementing hierarchical cache structures
- Organizing cache entries by domain or entity type

## Error Handling

RunCache operations can throw errors in certain situations:

```typescript
try {
  await RunCache.set({ key: '', value: 'Invalid key' });
} catch (error) {
  console.error('Error setting cache:', error.message);
  // Output: Error setting cache: Empty key
}

try {
  await RunCache.set({ key: 'valid-key' });
} catch (error) {
  console.error('Error setting cache:', error.message);
  // Output: Error setting cache: `value` can't be empty without a `sourceFn`
}
```

Common error scenarios include:
- Empty or invalid keys
- Missing required parameters
- Source function errors
- Storage adapter failures

## Basic Configuration

Configure RunCache with global settings:

```typescript
import { RunCache, EvictionPolicy } from 'run-cache';

// Configure cache settings
RunCache.configure({
  maxEntries: 1000, // Maximum number of entries
  evictionPolicy: EvictionPolicy.LRU, // Least Recently Used eviction policy
  debug: true // Enable debug logging for debugging
});

// Get current configuration
const config = RunCache.getConfig();
console.log(config);
```

Configuration options include:
- `maxEntries`: Maximum number of entries before eviction
- `evictionPolicy`: Strategy for removing entries when maxEntries is reached
- `debug`: Enable detailed logging for debugging
- `storageAdapter`: Configure persistent storage

## Practical Example: API Caching

Here's a practical example of using RunCache to cache API responses:

```typescript
async function fetchUserWithCache(userId) {
  const cacheKey = `user:${userId}`;
  
  // Try to get from cache first
  const cachedUser = await RunCache.get(cacheKey);
  if (cachedUser) {
    console.log('Cache hit for user:', userId);
    return JSON.parse(cachedUser);
  }
  
  // Cache miss, fetch from API
  console.log('Cache miss for user:', userId);
  try {
    const response = await fetch(`https://api.example.com/users/${userId}`);
    const userData = await response.json();
    
    // Store in cache with 1-hour TTL
    await RunCache.set({ 
      key: cacheKey, 
      value: JSON.stringify(userData),
      ttl: 60 * 60 * 1000 // 1 hour
    });
    
    return userData;
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
}

// Usage
const user1 = await fetchUserWithCache(1); // Cache miss, fetches from API
const user1Again = await fetchUserWithCache(1); // Cache hit, returns cached data
```

This pattern is commonly used to:
- Reduce API calls and improve performance
- Decrease load on backend services
- Improve user experience with faster response times
- Handle intermittent API failures gracefully

## Next Steps

Now that you understand RunCache, you can explore more advanced features:

- [TTL and Expiration](../features/ttl-expiration.md) - Learn more about time-to-live functionality
- [Source Functions](../features/source-functions.md) - Dive deeper into source functions
- [Eviction Policies](../features/eviction-policies.md) - Configure how cache entries are evicted
- [Pattern Matching](../features/pattern-matching.md) - Master wildcard patterns 