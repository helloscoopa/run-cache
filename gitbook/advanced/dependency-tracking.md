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
  value: { name: 'John Doe', email: 'john@example.com' }
});

// Dependent data
await RunCache.set({
  key: 'user:1:dashboard',
  value: { widgets: [...] },
  dependencies: ['user:1:profile'] // This entry depends on the profile
});
```

In this example:
- `user:1:dashboard` depends on `user:1:profile`
- If `user:1:profile` is updated or invalidated, `user:1:dashboard` will be automatically invalidated

Dependents (including indirect ones) are invalidated when the entry they depend on is:
- updated with `set()` (setting a key for the first time does not invalidate anything),
- refetched, manually with `refetch()` or automatically with `autoRefetch`,
- deleted, evicted, invalidated by tag, or expired (entries with `autoRefetch` invalidate their dependents when the refetch completes instead).

Two consequences are worth planning for:
- Any `set()` on an existing parent counts as a change, even if the value is the same, and so does every automatic refetch of a parent with `autoRefetch`. Each one invalidates the parent's dependents.
- Invalidated dependents are removed, including ones that have their own `sourceFn` and `autoRefetch`. They are not re-created automatically; call `set()` for them again (for example from a `dependency_invalidation` listener) if they should come back.

When an entry is both tagged and a dependent of another tagged entry, `invalidateByTag()` reports it with a `tag_invalidation` event. Only entries removed because of a dependency, and not because of the tag, get `dependency_invalidation` events.

`invalidateByDependency(key)` invalidates the dependents of `key` while leaving `key` itself in the cache. Each invalidated entry emits a `dependency_invalidation` event whose `dependencyKey` is the entry that changed.

## Multi-Level Dependencies

RunCache supports multi-level dependency chains:

```typescript
// Primary data
await RunCache.set({
  key: 'user:1:profile',
  value: { name: 'John Doe' }
});

// First-level dependent data
await RunCache.set({
  key: 'user:1:recommendations',
  value: [...],
  dependencies: ['user:1:profile']
});

// Second-level dependent data
await RunCache.set({
  key: 'home:feed',
  value: [...],
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
await RunCache.set({ key: 'products', value: [...] });
await RunCache.set({ key: 'categories', value: [...] });
await RunCache.set({ key: 'user:1:preferences', value: {...} });

// Dependent data that relies on multiple sources
await RunCache.set({
  key: 'user:1:product-recommendations',
  value: [...],
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

You can invalidate an entry's dependents without changing the entry itself using the `invalidateByDependency` method:

```typescript
// Invalidate everything that depends on the profile
await RunCache.invalidateByDependency('user:1:profile');
```

This will:
1. Invalidate all entries that directly depend on it (`user:1:recommendations`)
2. Invalidate all entries that depend on those entries (`home:feed`)
3. And so on, following the dependency chain

The specified entry (`user:1:profile`) itself is kept.

## Monitoring Dependency Invalidations

RunCache provides events to monitor dependency invalidations:

```typescript
// Global dependency invalidation event
await RunCache.onDependencyInvalidation((event) => {
  console.log(`Cache entry ${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});

// Specific key dependency invalidation
await RunCache.onKeyDependencyInvalidation("user:1:dashboard", (event) => {
  console.log(`Dashboard cache was invalidated due to dependency on: ${event.dependencyKey}`);
});

// Pattern-based dependency invalidation events
await RunCache.onKeyDependencyInvalidation("home:*", (event) => {
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
    return data;
  },
  ttl: 300000, // 5 minutes
  autoRefetch: true
});

// Dependent data with source function
await RunCache.set({
  key: 'user:1:recommendations',
  sourceFn: async () => {
    // Get the user profile from cache
    const profile = (await RunCache.get('user:1:profile')) as { preferences: string[] };

    // Use profile data to fetch recommendations
    const response = await fetch(`https://api.example.com/recommendations?preferences=${profile.preferences.join(',')}`);
    const recommendations = await response.json();
    return recommendations;
  },
  dependencies: ['user:1:profile'],
  ttl: 600000, // 10 minutes
  autoRefetch: true
});
```

In this example:
1. When `user:1:profile` is refreshed (automatically or manually), `user:1:recommendations` is invalidated and removed from the cache
2. It is not re-created on its own: the next `get('user:1:recommendations')` returns `undefined`
3. Set it again with its source function when it is next needed (or from a `dependency_invalidation` listener), and it is computed from the fresh profile

```typescript
await RunCache.onKeyDependencyInvalidation('user:1:recommendations', async () => {
  await RunCache.set({
    key: 'user:1:recommendations',
    sourceFn: fetchRecommendations,
    dependencies: ['user:1:profile'],
    ttl: 600000,
    autoRefetch: true
  });
});
```

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

RunCache rejects circular dependencies: the second `set()` above throws `Circular dependency detected`, and the entry is not written.

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
await RunCache.invalidateByTag('user:1');
// 3. Invalidate all feeds (via tag)
await RunCache.invalidateByTag('feed');
```

### 5. Monitor Invalidation Patterns

Use events to monitor and understand how your dependencies behave:

```typescript
// Track dependency invalidations
await RunCache.onDependencyInvalidation((event) => {
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
    value: article
  });

  // Determine related content IDs from the article
  const relatedIds = article.relatedArticles;

  // Cache related content with dependencies
  for (const relatedId of relatedIds) {
    const relatedArticle = await fetchArticle(relatedId);
    await RunCache.set({
      key: `article:${relatedId}`,
      value: relatedArticle,
      dependencies: [`article:${articleId}`] // Dynamic dependency
    });
  }
}
```

### 2. Dependency-Aware Refresh

Implement smart refreshing that considers dependencies:

```typescript
// RunCache cannot list keys (get('*') returns values), so pass in the keys you know about
async function smartRefresh(key, knownKeys) {
  // First, find the keys this key depends on
  const dependencyKeys = [];

  for (const cacheKey of knownKeys) {
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