# Migration Guide

This guide provides instructions for migrating from previous versions of RunCache to the latest version. It outlines breaking changes, deprecations, and new features that require special attention during upgrade.

## Migrating to v1.0

Version 1.0 is the first stable release of RunCache, establishing the foundation for future versions. If you're using a pre-1.0 version, follow these steps to migrate to 1.0.

### Breaking Changes

#### New Import Path

```typescript
// Pre-1.0
import { runCache } from 'run-cache';

// 1.0
import { RunCache } from 'run-cache';
```

#### Class-based API

RunCache is now accessed through a static class instead of a function:

```typescript
// Pre-1.0
const cache = runCache();
await cache.set('key', 'value');
const value = await cache.get('key');

// 1.0
await RunCache.set({ key: 'key', value: 'value' });
const value = await RunCache.get('key');
```

#### New Method Signatures

All methods have standardized signatures:

```typescript
// Pre-1.0
await cache.set('key', 'value', { ttl: 60000 });

// 1.0
await RunCache.set({ 
  key: 'key', 
  value: 'value',
  ttl: 60000
});
```

#### Configuration Changes

Configuration is now done through the `configure` method:

```typescript
// Pre-1.0
const cache = runCache({
  maxSize: 1000,
  verbose: true,
  policy: 'lru'
});

// 1.0
import { RunCache, EvictionPolicy } from 'run-cache';

RunCache.configure({
  maxEntries: 1000,
  evictionPolicy: EvictionPolicy.LRU,
  debug: true
});
```

### Migrating Your Codebase

#### Step 1: Update Imports

```typescript
// Before
import { runCache } from 'run-cache';

// After
import { RunCache, EvictionPolicy, EVENT } from 'run-cache';
```

#### Step 2: Update Configuration

```typescript
// Before
const cache = runCache({
  maxSize: 1000,
  verbose: true,
  policy: 'lru',
  logger: customLogger
});

// After
RunCache.configure({
  maxEntries: 1000,
  evictionPolicy: EvictionPolicy.LRU,
  debug: true // Replace custom logger with built-in debug mode
});
```

#### Step 3: Update Cache Operations

```typescript
// Before
await cache.set('key', 'value', { ttl: 60000 });
const value = await cache.get('key');
cache.delete('key');

// After
await RunCache.set({ key: 'key', value: 'value', ttl: 60000 });
const value = await RunCache.get('key');
RunCache.delete('key');
```

#### Step 4: Update Source Functions

```typescript
// Before
await cache.set('key', async () => {
  return JSON.stringify(await fetchData());
}, { ttl: 60000 });

// After
await RunCache.set({
  key: 'key',
  sourceFn: async () => {
    return JSON.stringify(await fetchData());
  },
  ttl: 60000
});
```

#### Step 5: Update Event Listeners

```typescript
// Before
cache.on('expire', (key, ttl) => {
  console.log(`${key} expired after ${ttl}ms`);
});

// After
RunCache.onExpiry((event) => {
  console.log(`${event.key} expired after ${event.ttl}ms`);
});
```

## Migrating to v2.0

Version 2.0 introduces several new features and some breaking changes from v1.x.

### Breaking Changes

#### TTL Value Format

TTL values are now consistently in milliseconds across all methods:

```typescript
// 1.x (mixed format: sometimes seconds, sometimes milliseconds)
await RunCache.set({ key: 'key', value: 'value', ttl: 60 }); // 60 seconds

// 2.0 (consistently milliseconds)
await RunCache.set({ key: 'key', value: 'value', ttl: 60000 }); // 60 seconds (60000ms)
```

#### Event API Changes

Event names are now accessed via the `EVENT` enum:

```typescript
// 1.x
RunCache.on('expire', callback);

// 2.0
import { RunCache, EVENT } from 'run-cache';
RunCache.onExpiry(callback);
// or for specific keys:
RunCache.onKeyExpiry('key-pattern', callback);
```

#### Middleware Signature

Middleware functions now have a new signature:

```typescript
// 1.x
RunCache.use((key, value, next) => {
  console.log(`Accessing ${key}`);
  return next(value);
});

// 2.0
RunCache.use(async (value, context, next) => {
  console.log(`${context.operation} for ${context.key}`);
  return await next(value);
});
```

### New Features

#### Storage Adapters

Version 2.0 introduces storage adapters for persistence:

```typescript
import { RunCache, LocalStorageAdapter } from 'run-cache';

// Configure with storage adapter
RunCache.configure({
  storageAdapter: new LocalStorageAdapter()
});

// Save and load manually
await RunCache.saveToStorage();
await RunCache.loadFromStorage();

// Setup auto-save
RunCache.setupAutoSave(300000); // Every 5 minutes
```

#### Tag-based Invalidation

```typescript
// Set entries with tags
await RunCache.set({
  key: 'user:1:profile',
  value: '...',
  tags: ['user:1', 'profile']
});

// Invalidate by tag
RunCache.invalidateByTag('user:1');
```

#### Dependency Tracking

```typescript
// Set entries with dependencies
await RunCache.set({
  key: 'dashboard',
  value: '...',
  dependencies: ['user:1:profile']
});

// Invalidate with dependencies
RunCache.invalidateByDependency('user:1:profile');
```

### Migrating Your Codebase

#### Step 1: Update TTL Values

```typescript
// Before (1.x)
await RunCache.set({ key: 'key', value: 'value', ttl: 60 }); // 60 seconds

// After (2.0)
await RunCache.set({ key: 'key', value: 'value', ttl: 60000 }); // 60000 milliseconds
```

#### Step 2: Update Event Listeners

```typescript
// Before (1.x)
RunCache.on('expire', (event) => {
  console.log(`${event.key} expired`);
});

// After (2.0)
RunCache.onExpiry((event) => {
  console.log(`${event.key} expired`);
});
```

#### Step 3: Update Middleware

```typescript
// Before (1.x)
RunCache.use((key, value, next) => {
  console.log(`Accessing ${key}`);
  return next(value);
});

// After (2.0)
RunCache.use(async (value, context, next) => {
  console.log(`${context.operation} for ${context.key}`);
  return await next(value);
});
```

## Migrating to v3.0

Version 3.0 focuses on performance improvements, TypeScript enhancements, and better resource management.

### Breaking Changes

#### Stricter Type Checking

TypeScript types are now stricter, requiring explicit type annotations in some cases:

```typescript
// 2.x (implicit types)
RunCache.configure({ maxEntries: 1000 });

// 3.0 (may require explicit types)
import { CacheConfig, EvictionPolicy } from 'run-cache';

const config: CacheConfig = {
  maxEntries: 1000,
  evictionPolicy: EvictionPolicy.LRU
};

RunCache.configure(config);
```

#### Promise Return Types

All methods now consistently return Promises:

```typescript
// 2.x (mixed return types)
RunCache.delete('key'); // No return value

// 3.0 (consistent promise returns)
await RunCache.delete('key'); // Returns a Promise
```

#### Event System Overhaul

The event system has been completely redesigned:

```typescript
// 2.x
RunCache.onExpiry(callback);
RunCache.clearEventListeners();

// 3.0
RunCache.onExpiry(callback);
RunCache.clearEventListeners({
  event: EVENT.EXPIRE,
  key: 'pattern',
  handler: specificHandler
});
```

### New Features

#### Enhanced Middleware Context

Middleware now receives more context information:

```typescript
RunCache.use(async (value, context, next) => {
  console.log(context.operation); // 'get', 'set', 'delete', 'refetch', or 'evict'
  console.log(context.key);       // The cache key
  console.log(context.metadata);  // Custom metadata associated with the operation
  
  return await next(value);
});
```

#### Pattern Matching Improvements

Pattern matching now supports more complex patterns:

```typescript
// Get all user profiles
const profiles = await RunCache.get('user:*:profile');

// Delete all temporary data
RunCache.delete('temp:*:*');

// Check if any api data exists
const hasApiData = await RunCache.has('api:*');
```

#### Resource Management

New methods for better resource management:

```typescript
// Shut down the cache completely
RunCache.shutdown();
```

### Migrating Your Codebase

#### Step 1: Update Method Calls for Promise Returns

```typescript
// Before (2.x)
RunCache.delete('key');
RunCache.flush();

// After (3.0)
await RunCache.delete('key');
await RunCache.flush();
```

#### Step 2: Update Event Listener Cleanup

```typescript
// Before (2.x)
RunCache.clearEventListeners();

// After (3.0)
// Clear all listeners
RunCache.clearEventListeners();

// Or clear specific listeners
RunCache.clearEventListeners({
  event: EVENT.EXPIRE,
  key: 'user:*'
});
```

#### Step 3: Add Proper Shutdown

```typescript
// Add shutdown call when application terminates
process.on('SIGTERM', () => {
  RunCache.shutdown();
  process.exit(0);
});

process.on('SIGINT', () => {
  RunCache.shutdown();
  process.exit(0);
});
```

## Automated Migration Script

For larger codebases, you can use this helper script to assist with migration:

```javascript
// migration-helper.js
const fs = require('fs');
const path = require('path');

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Update imports
  content = content.replace(
    /import\s*{\s*runCache\s*}/g,
    'import { RunCache, EvictionPolicy, EVENT }'
  );
  
  // Update configuration
  content = content.replace(
    /const\s+cache\s*=\s*runCache\(\s*{([^}]*)}\s*\)/g,
    'RunCache.configure({$1})'
  );
  
  // Update policy names
  content = content.replace(/policy:\s*['"]lru['"]/g, 'evictionPolicy: EvictionPolicy.LRU');
  content = content.replace(/policy:\s*['"]lfu['"]/g, 'evictionPolicy: EvictionPolicy.LFU');
  content = content.replace(/policy:\s*['"]none['"]/g, 'evictionPolicy: EvictionPolicy.NONE');
  
  // Update set operations
  content = content.replace(
    /cache\.set\(\s*['"]([^'"]+)['"]\s*,\s*(['"][^'"]+['"]|\{[^}]+\}|[a-zA-Z0-9_]+)\s*(?:,\s*\{([^}]*)\})?\s*\)/g,
    (match, key, value, options) => {
      if (options) {
        return `RunCache.set({ key: '${key}', value: ${value}, ${options} })`;
      } else {
        return `RunCache.set({ key: '${key}', value: ${value} })`;
      }
    }
  );
  
  // Update get operations
  content = content.replace(
    /cache\.get\(\s*['"]([^'"]+)['"]\s*\)/g,
    "RunCache.get('$1')"
  );
  
  // Update delete operations
  content = content.replace(
    /cache\.delete\(\s*['"]([^'"]+)['"]\s*\)/g,
    "RunCache.delete('$1')"
  );
  
  // Update event listeners
  content = content.replace(
    /cache\.on\(\s*['"]expire['"]\s*,/g,
    'RunCache.onExpiry('
  );
  
  content = content.replace(
    /cache\.on\(\s*['"]refetch['"]\s*,/g,
    'RunCache.onRefetch('
  );
  
  // Convert TTL values from seconds to milliseconds
  content = content.replace(
    /ttl:\s*(\d+)(?!\d*\s*\*\s*1000)/g,
    (match, ttl) => `ttl: ${ttl} * 1000`
  );
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Migrated: ${filePath}`);
}

function migrateDirectory(directory) {
  const files = fs.readdirSync(directory);
  
  for (const file of files) {
    const filePath = path.join(directory, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      migrateDirectory(filePath);
    } else if (file.endsWith('.js') || file.endsWith('.ts')) {
      migrateFile(filePath);
    }
  }
}

// Usage: node migration-helper.js /path/to/your/project
const projectDir = process.argv[2];
if (!projectDir) {
  console.error('Please provide a project directory');
  process.exit(1);
}

migrateDirectory(projectDir);
console.log('Migration completed!');
```

## Version Compatibility Table

| Feature | 1.0.x | 2.0.x | 3.0.x |
|---------|-------|-------|-------|
| Basic caching (set/get/delete) | ✅ | ✅ | ✅ |
| TTL expiration | ✅ | ✅ | ✅ |
| Source functions | ✅ | ✅ | ✅ |
| Automatic refetching | ✅ | ✅ | ✅ |
| Pattern matching | ✅ | ✅ | ✅ (Enhanced) |
| Eviction policies | ✅ | ✅ | ✅ |
| Event system | Basic | Enhanced | Complete |
| Middleware support | Basic | ✅ | ✅ (Enhanced) |
| Storage adapters | ❌ | ✅ | ✅ |
| Tag-based invalidation | ❌ | ✅ | ✅ |
| Dependency tracking | ❌ | ✅ | ✅ |
| TypeScript support | Basic | ✅ | ✅ (Strict) |
| Resource management | ❌ | Basic | ✅ |

## Common Migration Issues

### Issue: TTL Values Incorrectly Converted

```typescript
// Problem
await RunCache.set({ key: 'key', value: 'value', ttl: 60 * 1000 * 1000 }); // Wrong conversion

// Solution
await RunCache.set({ key: 'key', value: 'value', ttl: 60 * 1000 }); // Correct milliseconds
```

### Issue: Middleware Not Working After Migration

```typescript
// Problem (mixing old and new middleware patterns)
RunCache.use((value, context, next) => {
  console.log(key); // Error: key is not defined
  return next(value);
});

// Solution
RunCache.use((value, context, next) => {
  console.log(context.key); // Access key from context
  return next(value);
});
```

### Issue: Events Not Firing After Migration

```typescript
// Problem (using old event system)
RunCache.on('expire', callback);

// Solution
RunCache.onExpiry(callback);
```

## Next Steps

After migrating to the latest version of RunCache, explore these resources to learn about new features:

- [New Features Overview](../getting-started/quick-start.md) - Quick tour of the latest features
- [API Reference](../api/run-cache.md) - Complete API documentation
- [Best Practices](./best-practices.md) - Updated best practices for the latest version
- [Performance Optimization](./performance.md) - Tips for optimizing performance with the latest version 