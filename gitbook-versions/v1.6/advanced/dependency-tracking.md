# Dependency Tracking

Dependency tracking is an advanced feature in RunCache that allows you to establish relationships between cache entries. When a cache entry changes or is invalidated, all dependent entries are automatically invalidated as well. This guide explains how to use dependency tracking effectively in your applications.

## Understanding Dependency Tracking

Dependency tracking allows you to:
- Define relationships between cache entries
- Automatically invalidate dependent entries when a parent entry changes
- Create complex dependency chains with multi-level relationships
- Maintain data consistency across related cache entries

This is particularly useful for:
- Derived data that depends on base data
- Composite views that depend on multiple data sources
- Hierarchical data structures
- Ensuring consistency in complex caching scenarios

## Setting Up Dependencies

To establish a dependency relationship, use the `dependencies` parameter when setting a cache entry:

```typescript
// Primary data
await RunCache.set({
  key: 'user:1:profile',
  value: JSON.stringify({ name: 'John Doe', email: 'john@example.com' })
});

// Dependent data
await RunCache.set({
  key: 'user:1:dashboard',
  value: JSON.stringify({ widgets: [...] }),
  dependencies: ['user:1:profile'] // This entry depends on the profile
});
```

In this example:
- `user:1:dashboard` depends on `user:1:profile`
- If `user:1:profile` is updated or invalidated, `user:1:dashboard` will be automatically invalidated

## Multi-Level Dependencies

RunCache supports multi-level dependency chains:

```typescript
// Primary data
await RunCache.set({
  key: 'user:1:profile',
  value: JSON.stringify({ name: 'John Doe' })
});

// First-level dependent data
await RunCache.set({
  key: 'user:1:recommendations',
  value: JSON.stringify([...]),
  dependencies: ['user:1:profile']
});

// Second-level dependent data
await RunCache.set({
  key: 'home:feed',
  value: JSON.stringify([...]),
  dependencies: ['user:1:recommendations']
});
```

In this example:
- When `user:1:profile` changes, `user:1:recommendations` is invalidated
- When `user:1:recommendations` is invalidated (directly or via dependency), `home:feed` is also invalidated
- This creates a cascading invalidation effect

## Multiple Dependencies

A cache entry can depend on multiple other entries:

```typescript
// Primary data sources
await RunCache.set({ key: 'products', value: JSON.stringify([...]) });
await RunCache.set({ key: 'categories', value: JSON.stringify([...]) });
await RunCache.set({ key: 'user:1:preferences', value: JSON.stringify({...}) });

// Dependent data that relies on multiple sources
await RunCache.set({
  key: 'user:1:product-recommendations',
  value: JSON.stringify([...]),
  dependencies: ['products', 'categories', 'user:1:preferences']
});
```

In this example:
- `user:1:product-recommendations` depends on three different cache entries
- If any of those entries change, the recommendations will be invalidated

## Checking Dependencies

You can check if one cache entry depends on another (directly or indirectly) using the `isDependencyOf` method:

```typescript
// Check if one entry depends on another
const isDependency = await RunCache.isDependencyOf('home:feed', 'user:1:profile');
console.log(isDependency); // true (because of the multi-level dependency)

// Check a non-dependent relationship
const isNotDependency = await RunCache.isDependencyOf('products', 'categories');
console.log(isNotDependency); // false (no dependency relationship)
```

## Manual Dependency Invalidation

You can manually invalidate a cache entry and all its dependents using the `invalidateByDependency` method:

```typescript
// Invalidate an entry and all its dependents
RunCache.invalidateByDependency('user:1:profile');
```

This will:
1. Invalidate the specified entry (`user:1:profile`)
2. Invalidate all entries that directly depend on it (`user:1:recommendations`)
3. Invalidate all entries that depend on those entries (`home:feed`)
4. And so on, following the dependency chain

## Monitoring Dependency Invalidations

RunCache provides events to monitor dependency invalidations:

```typescript
// Global dependency invalidation event
RunCache.onDependencyInvalidation((event) => {
  console.log(`Cache entry ${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});

// Specific key dependency invalidation
RunCache.onKeyDependencyInvalidation("user:1:dashboard", (event) => {
  console.log(`Dashboard cache was invalidated due to dependency on: ${event.dependencyKey}`);
});

// Pattern-based dependency invalidation events
RunCache.onKeyDependencyInvalidation("home:*", (event) => {
  console.log(`Home page component ${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

These events can be useful for:
- Logging and monitoring
- Triggering additional actions when dependencies are invalidated
- Debugging complex dependency chains

## Combining Dependencies with Source Functions

Dependencies work particularly well with source functions and automatic refetching:

```typescript
// Primary data with source function
await RunCache.set({
  key: 'user:1:profile',
  sourceFn: async () => {
    const response = await fetch('https://api.example.com/users/1');
    const data = await response.json();
    return JSON.stringify(data);
  },
  ttl: 300000, // 5 minutes
  autoRefetch: true
});

// Dependent data with source function
await RunCache.set({
  key: 'user:1:recommendations',
  sourceFn: async () => {
    // Get the user profile from cache
    const profileJson = await RunCache.get('user:1:profile');
    const profile = JSON.parse(profileJson);
    
    // Use profile data to fetch recommendations
    const response = await fetch(`https://api.example.com/recommendations?preferences=${profile.preferences.join(',')}`);
    const recommendations = await response.json();
    return JSON.stringify(recommendations);
  },
  dependencies: ['user:1:profile'],
  ttl: 600000, // 10 minutes
  autoRefetch: true
});
```

In this example:
1. When `user:1:profile` is refreshed (automatically or manually), its dependents are invalidated
2. When `user:1:recommendations` is next accessed, its source function will be called
3. The source function will use the fresh profile data to generate new recommendations

This creates a powerful pattern for maintaining consistency while still benefiting from caching.

## Dependency Best Practices

### 1. Design Dependency Hierarchies Carefully

Plan your dependency relationships to reflect logical data dependencies:

```typescript
// Good - logical dependency hierarchy
await RunCache.set({ key: 'products', value: '...' });
await RunCache.set({ key: 'product:1:details', value: '...', dependencies: ['products'] });
await RunCache.set({ key: 'product:1:reviews', value: '...', dependencies: ['product:1:details'] });

// Avoid - circular dependencies
await RunCache.set({ key: 'user:1:friends', value: '...', dependencies: ['user:1:profile'] });
await RunCache.set({ key: 'user:1:profile', value: '...', dependencies: ['user:1:friends'] }); // Circular!
```

### 2. Avoid Deep Dependency Chains

Deep dependency chains can lead to widespread invalidations:

```typescript
// Potentially problematic - deep dependency chain
A → B → C → D → E → F → G

// Better - flatter dependency structure
A → B, C, D
E → F, G
```

Consider using tags for broader grouping when appropriate.

### 3. Be Specific with Dependencies

Define dependencies as specifically as possible:

```typescript
// Too broad - invalidates too much
await RunCache.set({ 
  key: 'user:1:dashboard', 
  value: '...', 
  dependencies: ['global:data'] // Very broad dependency
});

// Better - more specific dependencies
await RunCache.set({ 
  key: 'user:1:dashboard', 
  value: '...', 
  dependencies: ['user:1:profile', 'user:1:preferences'] // Only what's needed
});
```

### 4. Combine with Tags for Complex Scenarios

For complex invalidation needs, combine dependencies with tags:

```typescript
// Set up with both dependencies and tags
await RunCache.set({
  key: 'user:1:feed',
  value: '...',
  dependencies: ['user:1:profile', 'user:1:friends'],
  tags: ['user:1', 'feed']
});

// Different invalidation options:
// 1. Invalidate when profile changes (automatic via dependency)
// 2. Invalidate all user:1 data (via tag)
RunCache.invalidateByTag('user:1');
// 3. Invalidate all feeds (via tag)
RunCache.invalidateByTag('feed');
```

### 5. Monitor Invalidation Patterns

Use events to monitor and understand how your dependencies behave:

```typescript
// Track dependency invalidations
RunCache.onDependencyInvalidation((event) => {
  console.log(`${event.key} invalidated due to ${event.dependencyKey}`);
  // Track metrics about invalidation frequency
  trackMetric('cache.dependency.invalidation', {
    key: event.key,
    dependency: event.dependencyKey
  });
});
```

## Advanced Dependency Patterns

### 1. Dynamic Dependencies

Create dependencies dynamically based on content:

```typescript
async function cacheArticleWithRelatedContent(articleId) {
  // Fetch and cache the article
  const article = await fetchArticle(articleId);
  await RunCache.set({
    key: `article:${articleId}`,
    value: JSON.stringify(article)
  });
  
  // Determine related content IDs from the article
  const relatedIds = article.relatedArticles;
  
  // Cache related content with dependencies
  for (const relatedId of relatedIds) {
    const relatedArticle = await fetchArticle(relatedId);
    await RunCache.set({
      key: `article:${relatedId}`,
      value: JSON.stringify(relatedArticle),
      dependencies: [`article:${articleId}`] // Dynamic dependency
    });
  }
}
```

### 2. Dependency-Aware Refresh

Implement smart refreshing that considers dependencies:

```typescript
async function smartRefresh(key) {
  // First, check if this key has dependencies
  const allKeys = await RunCache.get('*'); // Get all cache keys
  const dependencyKeys = [];
  
  for (const cacheKey of allKeys) {
    if (await RunCache.isDependencyOf(key, cacheKey)) {
      dependencyKeys.push(cacheKey);
    }
  }
  
  // Refresh dependencies first (from furthest to closest)
  for (const depKey of dependencyKeys.reverse()) {
    await RunCache.refetch(depKey);
  }
  
  // Then refresh the target key
  await RunCache.refetch(key);
}
```

### 3. Conditional Dependencies

Implement conditional dependency relationships:

```typescript
// Check if we should establish a dependency
const shouldDependOn = await checkCondition();

await RunCache.set({
  key: 'conditional-data',
  value: '...',
  dependencies: shouldDependOn ? ['base-data'] : [] // Conditional dependency
});
```

## Next Steps

Now that you understand dependency tracking, explore these related topics:

- [Tag-based Invalidation](./tag-invalidation.md) - Another way to group and invalidate related cache entries
- [Event System](./event-system.md) - Learn more about monitoring cache events
- [Source Functions](../features/source-functions.md) - Understand how to generate cache values dynamically
- [Resource Management](./resource-management.md) - Learn about memory management and cleanup 