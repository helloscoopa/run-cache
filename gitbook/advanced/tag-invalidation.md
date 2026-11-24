# Tag-based Invalidation

Tag-based invalidation is a powerful feature in RunCache that allows you to group related cache entries and invalidate them together. This guide explains how to use tags effectively in your applications.

## Understanding Tag-based Invalidation

Tag-based invalidation allows you to:
- Group related cache entries under common tags
- Invalidate multiple cache entries at once using a single tag
- Create flexible grouping schemes independent of key naming
- Implement complex invalidation strategies

## Basic Usage

### Adding Tags to Cache Entries

When setting a cache entry, you can assign one or more tags to it:

```typescript
// Set a cache entry with tags
await RunCache.set({
  key: 'user:1:profile',
  value: { name: 'John Doe', email: 'john@example.com' },
  tags: ['user:1', 'profile']
});

// Another entry with some overlapping tags
await RunCache.set({
  key: 'user:1:settings',
  value: { theme: 'dark', notifications: true },
  tags: ['user:1', 'settings']
});

// Entry for a different user
await RunCache.set({
  key: 'user:2:profile',
  value: { name: 'Jane Smith', email: 'jane@example.com' },
  tags: ['user:2', 'profile']
});
```

In this example:
- Both `user:1:profile` and `user:1:settings` are tagged with `user:1`
- Both `user:1:profile` and `user:2:profile` are tagged with `profile`
- `user:1:settings` is uniquely tagged with `settings`

### Invalidating by Tag

To invalidate all cache entries with a specific tag:

```typescript
// Invalidate all entries tagged with 'user:1'
await RunCache.invalidateByTag('user:1');
```

This would invalidate both `user:1:profile` and `user:1:settings`, but not `user:2:profile`.

Similarly:

```typescript
// Invalidate all profile entries
await RunCache.invalidateByTag('profile');
```

This would invalidate both `user:1:profile` and `user:2:profile`, but not `user:1:settings`.

## Tag Design Strategies

### Hierarchical Tags

You can create hierarchical relationships using tag naming conventions:

```typescript
// Set cache entries with hierarchical tags
await RunCache.set({
  key: 'product:1:details',
  value: { name: 'Product 1', price: 99.99 },
  tags: ['product', 'product:1', 'product:details']
});

await RunCache.set({
  key: 'product:1:reviews',
  value: [{ rating: 5, text: 'Great product!' }],
  tags: ['product', 'product:1', 'product:reviews']
});

await RunCache.set({
  key: 'product:2:details',
  value: { name: 'Product 2', price: 149.99 },
  tags: ['product', 'product:2', 'product:details']
});
```

This allows for flexible invalidation:

```typescript
// Invalidate all product data
await RunCache.invalidateByTag('product');

// Invalidate all data for product 1
await RunCache.invalidateByTag('product:1');

// Invalidate details for all products
await RunCache.invalidateByTag('product:details');
```

### Role-based Tags

Tags can represent roles or categories:

```typescript
// Set cache entries with role-based tags
await RunCache.set({
  key: 'user:1:dashboard',
  value: { widgets: [...] },
  tags: ['user:1', 'dashboard', 'admin-view']
});

await RunCache.set({
  key: 'user:2:dashboard',
  value: { widgets: [...] },
  tags: ['user:2', 'dashboard', 'customer-view']
});

await RunCache.set({
  key: 'global:admin-settings',
  value: { settings: [...] },
  tags: ['global', 'admin-view']
});
```

This allows for role-based invalidation:

```typescript
// Invalidate all admin views when admin settings change
await RunCache.invalidateByTag('admin-view');

// Invalidate all dashboards
await RunCache.invalidateByTag('dashboard');
```

### Version Tags

Tags can be used for version-based invalidation:

```typescript
// Set cache entries with version tags
await RunCache.set({
  key: 'app:config',
  value: { theme: 'light', features: [...] },
  tags: ['config', 'v1.2.3']
});

await RunCache.set({
  key: 'app:translations',
  value: { en: {...}, es: {...} },
  tags: ['translations', 'v1.2.3']
});
```

When a new version is deployed:

```typescript
// Invalidate all cache entries from the previous version
await RunCache.invalidateByTag('v1.2.3');

// Set new cache entries with the new version tag
await RunCache.set({
  key: 'app:config',
  value: { theme: 'dark', features: [...] },
  tags: ['config', 'v1.3.0']
});
```

## Monitoring Tag Invalidations

RunCache provides events to monitor tag invalidations:

```typescript
// Global tag invalidation event
await RunCache.onTagInvalidation((event) => {
  console.log(`Cache key ${event.key} was invalidated by tag: ${event.tag}`);
});

// Specific key tag invalidation
await RunCache.onKeyTagInvalidation("user:1:profile", (event) => {
  console.log(`User profile was invalidated by tag: ${event.tag}`);
});

// Pattern-based tag invalidation events
await RunCache.onKeyTagInvalidation("user:*:profile", (event) => {
  console.log(`User profile ${event.key} was invalidated by tag: ${event.tag}`);
});
```

Each entry is removed before its event is emitted, so listeners see the cache in its invalidated state: `RunCache.has(event.key)` returns `false`, while `event.value` still holds the removed value. An error thrown by a listener does not stop the remaining entries from being invalidated. The same applies to dependency invalidation events.

## Combining Tags with Other Features

### Tags with TTL

Combine tags with TTL for time-based invalidation:

```typescript
// Set cache entry with tags and TTL
await RunCache.set({
  key: 'weather:nyc',
  value: { temp: 72, conditions: 'sunny' },
  tags: ['weather', 'location:nyc'],
  ttl: 3600000 // 1 hour
});

// Set cache entry with tags and TTL
await RunCache.set({
  key: 'weather:la',
  value: { temp: 85, conditions: 'clear' },
  tags: ['weather', 'location:la'],
  ttl: 3600000 // 1 hour
});
```

This allows for both time-based expiration and manual invalidation:

```typescript
// Invalidate all weather data regardless of TTL
await RunCache.invalidateByTag('weather');

// Invalidate just NYC weather data
await RunCache.invalidateByTag('location:nyc');
```

### Tags with Source Functions

Combine tags with source functions for automatic refreshing:

```typescript
// Set cache entry with tags and source function
await RunCache.set({
  key: 'stock:AAPL',
  sourceFn: async () => {
    const response = await fetch('https://api.example.com/stocks/AAPL');
    const data = await response.json();
    return data;
  },
  tags: ['stock', 'tech-stock'],
  ttl: 60000, // 1 minute
  autoRefetch: true
});

await RunCache.set({
  key: 'stock:MSFT',
  sourceFn: async () => {
    const response = await fetch('https://api.example.com/stocks/MSFT');
    const data = await response.json();
    return data;
  },
  tags: ['stock', 'tech-stock'],
  ttl: 60000, // 1 minute
  autoRefetch: true
});
```

This allows for both automatic refreshing and manual invalidation:

```typescript
// Force refresh all tech stock data immediately
await RunCache.invalidateByTag('tech-stock');
```

### Tags with Dependencies

Combine tags with dependencies for complex invalidation strategies:

```typescript
// Primary data with tags
await RunCache.set({
  key: 'products',
  value: [...],
  tags: ['product-data', 'catalog']
});

// Dependent data with tags
await RunCache.set({
  key: 'featured-products',
  value: [...],
  dependencies: ['products'],
  tags: ['product-data', 'featured']
});

await RunCache.set({
  key: 'product-recommendations',
  value: [...],
  dependencies: ['products', 'user-preferences'],
  tags: ['product-data', 'personalized']
});
```

This provides multiple ways to invalidate:

```typescript
// Option 1: Invalidate by dependency (cascades to dependents)
await RunCache.invalidateByDependency('products');

// Option 2: Invalidate by tag (direct invalidation)
await RunCache.invalidateByTag('product-data');

// Option 3: Invalidate just personalized content
await RunCache.invalidateByTag('personalized');
```

## Advanced Tag Patterns

### Dynamic Tag Generation

Generate tags dynamically based on data or context:

```typescript
function generateUserTags(user) {
  const tags = [`user:${user.id}`];

  if (user.role) {
    tags.push(`role:${user.role}`);
  }

  if (user.subscriptionLevel) {
    tags.push(`subscription:${user.subscriptionLevel}`);
  }

  if (user.region) {
    tags.push(`region:${user.region}`);
  }

  return tags;
}

// Usage
const user = await fetchUser(1);
await RunCache.set({
  key: `user:${user.id}:profile`,
  value: user,
  tags: generateUserTags(user)
});
```

### Tag-based Prefetching

Use tags to implement prefetching strategies:

```typescript
// Listen for tag invalidations
await RunCache.onTagInvalidation((event) => {
  if (event.tag === 'product-data') {
    // Prefetch related data that might be needed soon
    prefetchRelatedData();
  }
});

async function prefetchRelatedData() {
  // Prefetch in the background
  const relatedData = await fetchRelatedData();
  await RunCache.set({
    key: 'related-products',
    value: relatedData,
    tags: ['product-data', 'related']
  });
}
```

### Conditional Tag Invalidation

Implement conditional tag invalidation logic:

```typescript
async function conditionalInvalidate(tag, condition) {
  if (await condition()) {
    console.log(`Invalidating tag: ${tag}`);
    await RunCache.invalidateByTag(tag);
    return true;
  }
  console.log(`Condition not met, tag ${tag} not invalidated`);
  return false;
}

// Usage
await conditionalInvalidate('user-data', async () => {
  const lastUpdate = await getLastUpdateTimestamp('user-data');
  const threshold = Date.now() - (60 * 60 * 1000); // 1 hour ago
  return lastUpdate < threshold;
});
```

## Best Practices for Tag-based Invalidation

### 1. Use Consistent Tag Naming Conventions

Adopt a consistent tag naming convention:

```typescript
// Good - consistent naming with clear hierarchy
tags: ['entity:user', 'user:1', 'type:profile']

// Avoid - inconsistent naming
tags: ['User', 'user_1', 'Profile']
```

### 2. Keep Tag Lists Manageable

Don't use too many tags per cache entry:

```typescript
// Good - focused, relevant tags
tags: ['user:1', 'profile', 'settings']

// Avoid - too many tags
tags: ['user:1', 'profile', 'settings', 'john', 'doe', 'admin', 'active', 'verified', 'english', 'premium']
```

### 3. Document Tag Schemas

Document your tag naming conventions and schemas:

```typescript
/**
 * Tag Schema:
 * - entity:{entityType} - The type of entity (user, product, etc.)
 * - {entityType}:{id} - Specific entity instance (user:1, product:xyz)
 * - type:{dataType} - The type of data (profile, settings, etc.)
 * - role:{roleName} - User role (admin, customer, etc.)
 * - region:{regionCode} - Geographic region (us, eu, etc.)
 * - version:{versionNumber} - Application version
 */
```

### 4. Avoid Overly Generic Tags

Be specific enough with tags to avoid unintended invalidations:

```typescript
// Too generic - affects too many entries
tags: ['data']

// Better - more specific
tags: ['user-data']

// Best - most specific for the use case
tags: ['user:1:profile-data']
```

### 5. Consider Tag Cardinality

Be mindful of how many cache entries a tag might apply to:

```typescript
// High cardinality - unique to one entry
tags: [`unique:${uuid()}`] // Avoid unless needed

// Medium cardinality - applies to a reasonable group
tags: [`user:${userId}`] // Good for user-specific data

// Low cardinality - applies to many entries
tags: ['global'] // Use carefully
```

## Common Tag-based Invalidation Use Cases

### 1. User Data Invalidation

Cache and invalidate user-specific data:

```typescript
// Store user data with tags
await RunCache.set({
  key: `user:${userId}:profile`,
  value: profile,
  tags: [`user:${userId}`]
});

await RunCache.set({
  key: `user:${userId}:preferences`,
  value: preferences,
  tags: [`user:${userId}`]
});

await RunCache.set({
  key: `user:${userId}:activity`,
  value: activity,
  tags: [`user:${userId}`]
});

// When user data changes
async function handleUserDataChange(userId) {
  // Invalidate all data for this user
  await RunCache.invalidateByTag(`user:${userId}`);
}
```

### 2. Content Management

Cache and invalidate content by category:

```typescript
// Store content with category tags
await RunCache.set({
  key: `article:${articleId}`,
  value: article,
  tags: ['content', `category:${article.category}`, `author:${article.authorId}`]
});

// Invalidation scenarios
async function handleCategoryUpdate(category) {
  // Invalidate all content in this category
  await RunCache.invalidateByTag(`category:${category}`);
}

async function handleAuthorUpdate(authorId) {
  // Invalidate all content by this author
  await RunCache.invalidateByTag(`author:${authorId}`);
}

async function handleGlobalContentUpdate() {
  // Invalidate all content
  await RunCache.invalidateByTag('content');
}
```

### 3. API Response Caching

Cache API responses with appropriate tags:

```typescript
async function cachedApiRequest(endpoint, params = {}, options = {}) {
  // Generate a cache key based on the endpoint and params
  const key = `api:${endpoint}:${JSON.stringify(params)}`;

  // Define tags based on the endpoint and params
  const tags = ['api'];
  tags.push(`api:${endpoint}`);

  if (params.userId) {
    tags.push(`user:${params.userId}`);
  }

  if (params.category) {
    tags.push(`category:${params.category}`);
  }

  // Check cache first
  const cachedResponse = await RunCache.get(key);
  if (cachedResponse !== undefined) { // false and 0 are valid cached responses
    return cachedResponse;
  }

  // If not in cache, make the API request
  const response = await fetch(`https://api.example.com/${endpoint}`, {
    method: 'POST',
    body: JSON.stringify(params),
    headers: { 'Content-Type': 'application/json' }
  });

  const data = await response.json();

  // Cache the response with appropriate tags and TTL
  await RunCache.set({
    key,
    value: data,
    tags,
    ttl: options.ttl || 300000 // 5 minutes default
  });

  return data;
}

// Usage
const userData = await cachedApiRequest('users/profile', { userId: 123 });

// When user data changes
async function invalidateUserApiCache(userId) {
  await RunCache.invalidateByTag(`user:${userId}`);
}
```

### 4. Multi-level Caching

Implement multi-level caching with tags:

```typescript
// L1 cache (short TTL, frequently accessed)
await RunCache.set({
  key: 'dashboard:summary',
  value: summary,
  tags: ['dashboard', 'summary', 'l1-cache'],
  ttl: 60000 // 1 minute
});

// L2 cache (longer TTL, less frequently accessed)
await RunCache.set({
  key: 'dashboard:details',
  value: details,
  tags: ['dashboard', 'details', 'l2-cache'],
  ttl: 3600000 // 1 hour
});

// Selective invalidation
async function invalidateL1Cache() {
  await RunCache.invalidateByTag('l1-cache');
}

async function invalidateDashboard() {
  await RunCache.invalidateByTag('dashboard');
}
```

## Next Steps

Now that you understand tag-based invalidation, explore these related topics:

- [Dependency Tracking](./dependency-tracking.md) - Learn about establishing relationships between cache entries
- [Event System](./event-system.md) - Understand how to use events for cache monitoring
- [Pattern Matching](../features/pattern-matching.md) - Learn about wildcard pattern matching for cache operations
- [Resource Management](./resource-management.md) - Learn about memory management and cleanup 