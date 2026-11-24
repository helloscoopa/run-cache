# Pattern Matching

RunCache supports wildcard pattern matching for operating on multiple related cache keys simultaneously. This guide explains how to use pattern matching effectively in your applications.

## Understanding Pattern Matching

Pattern matching allows you to:
- Retrieve multiple related cache entries at once
- Delete groups of related entries
- Check if any entries matching a pattern exist
- Refresh multiple entries with a single call
- Register event listeners for groups of keys

The pattern matching system uses the `*` character as a wildcard that matches any sequence of characters in a key.

## Basic Pattern Syntax

The pattern matching syntax is simple:
- `*` matches any sequence of characters
- Any other character matches itself

Examples:
- `user:*` matches any key starting with "user:"
- `*:profile` matches any key ending with ":profile"
- `user:*:settings` matches keys like "user:1:settings", "user:john:settings", etc.
- `*stats*` matches any key containing "stats" anywhere

## Using Patterns with Get

The `get` method supports patterns to retrieve multiple cache entries:

```typescript
// Set multiple related entries
await RunCache.set({ key: 'user:1:name', value: 'Alice' });
await RunCache.set({ key: 'user:1:email', value: 'alice@example.com' });
await RunCache.set({ key: 'user:2:name', value: 'Bob' });
await RunCache.set({ key: 'user:2:email', value: 'bob@example.com' });

// Get all user names
const names = await RunCache.get('user:*:name');
console.log(names); // Output: ['Alice', 'Bob']

// Get all data for user 1
const user1Data = await RunCache.get('user:1:*');
console.log(user1Data); // Output: ['Alice', 'alice@example.com']
```

When using patterns with `get`:
- Returns an array of values for matching keys
- Returns an empty array if no keys match
- Order is not guaranteed (don't rely on the order of results)

## Using Patterns with Delete

The `delete` method supports patterns to remove multiple cache entries:

```typescript
// Delete all data for user 1
RunCache.delete('user:1:*');

// Delete all email entries
RunCache.delete('user:*:email');

// Delete all user data
RunCache.delete('user:*');
```

## Using Patterns with Has

The `has` method supports patterns to check if any matching entries exist:

```typescript
// Check if any user 2 data exists
const hasUser2Data = await RunCache.has('user:2:*');
if (hasUser2Data) {
  console.log('User 2 has some cached data');
}

// Check if any email data exists
const hasEmails = await RunCache.has('*:email');
```

When using patterns with `has`:
- Returns `true` if any matching key exists (and hasn't expired)
- Returns `false` if no matching keys exist

## Using Patterns with Refetch

The `refetch` method supports patterns to refresh multiple cache entries:

```typescript
// Refresh all profile data
await RunCache.refetch('user:*:profile');

// Refresh all data for user 1
await RunCache.refetch('user:1:*');
```

This only works for entries that were created with a source function.

## Pattern Matching with Event Listeners

You can use patterns when registering event listeners:

```typescript
// Listen for expiry of any user profile
RunCache.onKeyExpiry('user:*:profile', (event) => {
  console.log(`User profile ${event.key} expired`);
});

// Listen for refetch of any API data
RunCache.onKeyRefetch('api:*', (event) => {
  console.log(`API data ${event.key} was refreshed`);
});
```

## Pattern Matching Best Practices

### 1. Use Structured Key Naming

Adopt a consistent key naming convention to make pattern matching more effective:

```typescript
// Good - structured naming with clear segments
await RunCache.set({ key: 'user:1:profile', value: '...' });
await RunCache.set({ key: 'user:1:settings', value: '...' });
await RunCache.set({ key: 'post:123:comments', value: '...' });

// Less effective - inconsistent naming
await RunCache.set({ key: 'user1Profile', value: '...' });
await RunCache.set({ key: 'user1_settings', value: '...' });
await RunCache.set({ key: 'post123Comments', value: '...' });
```

A common convention is to use colons (`:`) as separators for hierarchical keys:
- `entity:id:attribute`
- `domain:subDomain:item`
- `context:identifier:property`

### 2. Be Specific with Patterns

Use patterns that are as specific as possible to avoid unintended matches:

```typescript
// Too broad - might match unrelated keys
await RunCache.delete('user*');

// Better - more specific pattern
await RunCache.delete('user:*');

// Best - most specific pattern for the use case
await RunCache.delete('user:1:*');
```

### 3. Consider Performance Implications

Pattern matching operations require checking all cache keys, which can be expensive for large caches:

```typescript
// Inefficient for large caches - checks all keys
const allUserData = await RunCache.get('user:*');

// More efficient - use specific patterns when possible
const specificUserData = await RunCache.get('user:1:*');
```

### 4. Use Tags for Complex Grouping

For complex grouping needs, consider using tags instead of relying solely on pattern matching:

```typescript
// Set entries with tags
await RunCache.set({ 
  key: 'user:1:profile', 
  value: '...', 
  tags: ['user:1', 'profile']
});

await RunCache.set({ 
  key: 'user:1:settings', 
  value: '...', 
  tags: ['user:1', 'settings']
});

// Later, invalidate by tag
RunCache.invalidateByTag('user:1');
```

## Common Pattern Matching Use Cases

### 1. User-Specific Data

Cache and manage user-specific data:

```typescript
// Store user data
await RunCache.set({ key: `user:${userId}:profile`, value: profileData });
await RunCache.set({ key: `user:${userId}:preferences`, value: preferencesData });
await RunCache.set({ key: `user:${userId}:activity`, value: activityData });

// When user logs out, clear all their data
RunCache.delete(`user:${userId}:*`);
```

### 2. API Response Caching

Cache API responses with structured keys:

```typescript
// Cache API responses
await RunCache.set({ 
  key: `api:users:list:page=${page}:limit=${limit}`, 
  value: JSON.stringify(usersList),
  ttl: 300000 // 5 minutes
});

// Invalidate all user list caches when data changes
RunCache.delete('api:users:list:*');
```

### 3. Feature Flags

Manage feature flags with pattern matching:

```typescript
// Set feature flags
await RunCache.set({ key: 'feature:darkMode:enabled', value: 'true' });
await RunCache.set({ key: 'feature:newUI:enabled', value: 'false' });

// Check if a feature is enabled
const featureFlags = await RunCache.get('feature:*:enabled');
const darkModeEnabled = featureFlags.includes('true');

// Disable all features
await RunCache.set({ key: 'feature:*:enabled', value: 'false' });
```

### 4. Hierarchical Data

Manage hierarchical data structures:

```typescript
// Store hierarchical data
await RunCache.set({ key: 'org:1:dept:engineering:team:frontend', value: '...' });
await RunCache.set({ key: 'org:1:dept:engineering:team:backend', value: '...' });
await RunCache.set({ key: 'org:1:dept:marketing:team:content', value: '...' });

// Get all engineering teams
const engineeringTeams = await RunCache.get('org:1:dept:engineering:team:*');

// Delete all marketing teams
RunCache.delete('org:1:dept:marketing:team:*');
```

## Advanced Pattern Matching Techniques

### 1. Dynamic Pattern Generation

Generate patterns dynamically based on application state:

```typescript
function generateUserPattern(userId, section = null) {
  if (section) {
    return `user:${userId}:${section}:*`;
  }
  return `user:${userId}:*`;
}

// Usage
const userProfileData = await RunCache.get(generateUserPattern(userId, 'profile'));
RunCache.delete(generateUserPattern(userId)); // Delete all user data
```

### 2. Pattern-Based Cache Warming

Use patterns to implement cache warming strategies:

```typescript
async function warmUserCache(userId) {
  // Check if user data is already cached
  const hasUserData = await RunCache.has(`user:${userId}:*`);
  
  if (!hasUserData) {
    // Fetch and cache user data
    const userData = await fetchUserData(userId);
    await RunCache.set({ key: `user:${userId}:profile`, value: JSON.stringify(userData.profile) });
    await RunCache.set({ key: `user:${userId}:preferences`, value: JSON.stringify(userData.preferences) });
    // ...more user data
  }
}
```

### 3. Combining Patterns with Other Features

Combine pattern matching with other RunCache features:

```typescript
// Set up entries with TTL and autoRefetch
await RunCache.set({
  key: `data:region:${region}:stats`,
  sourceFn: () => fetchRegionStats(region),
  ttl: 300000,
  autoRefetch: true
});

// Listen for refetch events on all region stats
RunCache.onKeyRefetch('data:region:*:stats', (event) => {
  console.log(`Stats for ${event.key} were refreshed`);
});

// Manually refresh all region stats
await RunCache.refetch('data:region:*:stats');
```

## Next Steps

Now that you understand pattern matching, explore these related topics:

- [Cache Management](./cache-management.md) - Learn more about basic cache operations
- [Tag-based Invalidation](../advanced/tag-invalidation.md) - Another way to group and invalidate related cache entries
- [Event System](../advanced/event-system.md) - Understand how to use events with pattern matching
- [Resource Management](../advanced/resource-management.md) - Learn about memory management and cleanup 