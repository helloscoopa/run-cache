# Cache Management

This guide covers the core cache management operations in RunCache, including how to store, retrieve, and delete cache entries.

## Basic Cache Operations

RunCache provides a set of fundamental operations for managing cache entries:

- **Set**: Store a value in the cache
- **Get**: Retrieve a value from the cache
- **Has**: Check if a key exists in the cache
- **Delete**: Remove a specific entry from the cache
- **Flush**: Clear the entire cache

Let's explore each of these operations in detail.

## Setting Cache Entries

The `set` method is used to store values in the cache:

```typescript
await RunCache.set({
  key: string,                         // Required: Unique identifier for the cache entry
  value?: string,                      // Optional: String value to cache (required if no sourceFn)
  ttl?: number,                        // Optional: Time-to-live in milliseconds
  autoRefetch?: boolean,               // Optional: Automatically refetch on expiry
  sourceFn?: () => string | Promise<string>, // Optional: Function to generate cache value
  tags?: string[],                     // Optional: Array of tags for tag-based invalidation
  dependencies?: string[]              // Optional: Array of cache keys this entry depends on
});
```

### Basic Examples

```typescript
// Store a simple string
await RunCache.set({ key: 'greeting', value: 'Hello, World!' });

// Store a JSON object (must be stringified)
const user = { id: 1, name: 'John Doe' };
await RunCache.set({ key: 'user:1', value: JSON.stringify(user) });

// Store with expiration (TTL)
await RunCache.set({ 
  key: 'temporary-data', 
  value: 'This will expire soon',
  ttl: 60000 // 1 minute
});
```

### Advanced Examples

```typescript
// Store with a source function
await RunCache.set({
  key: 'api-data',
  sourceFn: async () => {
    const response = await fetch('https://api.example.com/data');
    const data = await response.json();
    return JSON.stringify(data);
  }
});

// Store with tags for group invalidation
await RunCache.set({
  key: 'user:1:profile',
  value: JSON.stringify({ name: 'John Doe' }),
  tags: ['user:1', 'profile']
});

// Store with dependencies
await RunCache.set({
  key: 'dashboard:1',
  value: JSON.stringify({ widgets: [...] }),
  dependencies: ['user:1:profile']
});
```

## Retrieving Cache Entries

The `get` method is used to retrieve values from the cache:

```typescript
const value = await RunCache.get(key);
```

### Basic Examples

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

### Using Patterns

You can use wildcard patterns to retrieve multiple related entries:

```typescript
// Get all user profiles
const profiles = await RunCache.get('user:*:profile');
console.log(profiles); // Array of all matching values

// Get all data for user 1
const userData = await RunCache.get('user:1:*');
```

When using patterns, `get` returns an array of values that match the pattern.

## Checking Cache Status

The `has` method checks if a valid (non-expired) cache entry exists:

```typescript
const exists = await RunCache.has(key);
```

### Examples

```typescript
// Check if a specific key exists
const hasGreeting = await RunCache.has('greeting');
if (hasGreeting) {
  console.log('Greeting is cached');
}

// Check if any keys matching a pattern exist
const hasUserData = await RunCache.has('user:1:*');
if (hasUserData) {
  console.log('User 1 has some cached data');
}
```

## Deleting Cache Entries

The `delete` method removes entries from the cache:

```typescript
RunCache.delete(key);
```

### Examples

```typescript
// Delete a specific entry
RunCache.delete('greeting');

// Delete multiple entries using a pattern
RunCache.delete('user:1:*'); // Deletes all entries that match the pattern
```

## Clearing the Entire Cache

The `flush` method removes all entries from the cache:

```typescript
RunCache.flush();
```

This is useful for:
- Testing scenarios
- Handling major data changes
- User logout operations
- Freeing up memory

## Refreshing Cache Entries

The `refetch` method manually refreshes cache entries that were created with a source function:

```typescript
await RunCache.refetch(key);
```

### Examples

```typescript
// Refresh a specific entry
await RunCache.refetch('api-data');

// Refresh multiple entries using a pattern
await RunCache.refetch('user:*:profile');
```

## Best Practices

Here are some best practices for effective cache management:

1. **Use consistent key naming conventions**:
   - Adopt a structured approach like `entity:id:attribute`
   - Use lowercase for consistency
   - Use colons (`:`) as separators for hierarchical keys

2. **Handle cache misses gracefully**:
   - Always check if values exist before using them
   - Provide fallback mechanisms for cache misses

3. **Use appropriate TTL values**:
   - Consider data volatility when setting TTL
   - Use shorter TTLs for frequently changing data
   - Use longer TTLs for stable data

4. **Implement cache warming**:
   - Pre-populate critical cache entries on application startup
   - Use source functions for automatic population

5. **Monitor cache usage**:
   - Use the event system to track cache operations
   - Implement logging for cache hits and misses

## Next Steps

Now that you understand basic cache management, explore these related topics:

- [TTL and Expiration](./ttl-expiration.md) - Learn more about time-to-live functionality
- [Eviction Policies](./eviction-policies.md) - Configure how cache entries are evicted
- [Pattern Matching](./pattern-matching.md) - Master wildcard patterns
- [Tag-based Invalidation](../advanced/tag-invalidation.md) - Group and invalidate related cache entries 