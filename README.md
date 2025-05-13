[![npm-version](https://img.shields.io/npm/v/run-cache)](https://www.npmjs.com/package/run-cache)
[![license](https://img.shields.io/github/license/helloscoopa/run-cache)](https://github.com/helloscoopa/run-cache?tab=MIT-1-ov-file)
[![ci-build](https://img.shields.io/github/actions/workflow/status/helloscoopa/run-cache/build.yml?label=build)](https://github.com/helloscoopa/run-cache/actions/workflows/build.yml)
[![ci-tests](https://img.shields.io/github/actions/workflow/status/helloscoopa/run-cache/tests.yml?label=tests)](https://github.com/helloscoopa/run-cache/actions/workflows/tests.yml)

# RunCache

A dependency-free, lightweight runtime caching library for JavaScript and TypeScript applications. RunCache allows you to cache string values with configurable time-to-live (TTL) settings and supports automatic value regeneration through source functions.

## Key Features

- **Zero Dependencies:** Lightweight implementation with no external dependencies
- **In-Memory Performance:** Fast, efficient runtime cache for optimal application performance
- **Source Function Support:** Cache values generated from synchronous or asynchronous functions
- **Automatic Refetching:** Configure cache entries to automatically refresh on expiration
- **Comprehensive Event System:** Subscribe to cache events including expiry, refetch, and refetch failures
- **Pattern Matching:** Use wildcard patterns to operate on groups of related cache keys
- **Eviction Policies:** Configure size limits with LRU (Least Recently Used) or LFU (Least Frequently Used) eviction strategies
- **Middleware Support:** Add custom processing for intercepting and transforming cache operations
- **Tag-based Invalidation:** Group related cache entries with tags for efficient batch invalidation
- **Dependency Tracking:** Establish relationships between cache entries with automatic cascading invalidation
- **TypeScript Support:** Full type definitions included

## Installation

```bash
npm install run-cache
```

## Quick Start

```typescript
import { RunCache } from "run-cache";

// Basic caching
await RunCache.set({ key: "user-profile", value: JSON.stringify({ name: "John Doe" }) });
const profile = await RunCache.get("user-profile");

// Cache with expiration (TTL in milliseconds)
await RunCache.set({ 
  key: "api-data", 
  value: JSON.stringify({ data: [1, 2, 3] }),
  ttl: 60000 // 1 minute
});

// Cache with automatic refresh
await RunCache.set({
  key: "weather-data",
  sourceFn: async () => JSON.stringify(await fetchWeatherData()),
  ttl: 300000, // 5 minutes
  autoRefetch: true
});

// Using wildcard patterns
await RunCache.set({ key: "user-1", value: "Alice" });
await RunCache.set({ key: "user-2", value: "Bob" });
const users = await RunCache.get("user-*"); // Returns array of all matching values
```

## Cache Eviction Policies

RunCache supports configurable cache eviction policies to manage memory usage by automatically removing entries when the cache reaches a defined size limit.

### Available Eviction Policies

- **NONE**: No automatic eviction (default). Cache entries are only removed via TTL or manual deletion.
- **LRU (Least Recently Used)**: Removes the least recently accessed entries when the cache exceeds its maximum size.
- **LFU (Least Frequently Used)**: Removes the least frequently accessed entries when the cache exceeds its maximum size. When entries have the same access frequency, the oldest entry is removed first.

### Configuring Eviction Policies

```typescript
import { RunCache, EvictionPolicy } from "run-cache";

// Configure the cache with a max size of 100 entries and LRU eviction policy
RunCache.configure({
  maxEntries: 100,
  evictionPolicy: EvictionPolicy.LRU
});

// Add entries to the cache
for (let i = 0; i < 150; i++) {
  await RunCache.set({ key: `item-${i}`, value: `value-${i}` });
}

// Only the 100 most recently used entries will be retained
// The oldest 50 entries will be automatically evicted

// Change to LFU eviction policy
RunCache.configure({
  evictionPolicy: EvictionPolicy.LFU
});

// Get the current configuration
const config = RunCache.getConfig();
console.log(config); // { maxEntries: 100, evictionPolicy: "lfu" }
```

## Tag-based Invalidation

RunCache supports tagging cache entries and invalidating groups of related entries using tags.

```typescript
// Set entries with tags
await RunCache.set({ 
  key: "user:123:profile", 
  value: JSON.stringify({ name: "John Doe" }),
  tags: ["user:123", "profile"]
});

await RunCache.set({ 
  key: "user:123:settings", 
  value: JSON.stringify({ theme: "dark" }),
  tags: ["user:123", "settings"]
});

await RunCache.set({ 
  key: "user:123:posts", 
  value: JSON.stringify([{ id: 1, title: "Hello" }]),
  tags: ["user:123", "posts"]
});

// Later, when user data changes, invalidate all related cache entries with a single call
RunCache.invalidateByTag("user:123");

// This removes all three entries with the "user:123" tag

// You can also listen for tag invalidation events
RunCache.onTagInvalidation((event) => {
  console.log(`Cache entry ${event.key} was invalidated by tag: ${event.tag}`);
});
```

## Dependency Tracking

RunCache enables establishing dependency relationships between cache entries with automatic cascading invalidation.

```typescript
// Set the primary data cache
await RunCache.set({ 
  key: "user:123:profile", 
  value: JSON.stringify({ name: "John Doe" })
});

// Set dependent caches that rely on the profile data
await RunCache.set({ 
  key: "user:123:dashboard", 
  value: JSON.stringify({ widgets: [...] }),
  dependencies: ["user:123:profile"]
});

await RunCache.set({ 
  key: "user:123:recommendations", 
  value: JSON.stringify([...]),
  dependencies: ["user:123:profile"]
});

// Create multi-level dependencies
await RunCache.set({ 
  key: "home:feed", 
  value: JSON.stringify([...]),
  dependencies: ["user:123:recommendations"]
});

// Check if one entry depends on another (directly or indirectly)
const isDependency = await RunCache.isDependencyOf("home:feed", "user:123:profile");
console.log(isDependency); // true

// When the primary data changes, invalidate dependent entries with cascading effect
RunCache.invalidateByDependency("user:123:profile");

// This will invalidate all dependent entries, including nested dependencies:
// - user:123:dashboard
// - user:123:recommendations
// - home:feed (because it depends on user:123:recommendations)

// You can also listen for dependency invalidation events
RunCache.onDependencyInvalidation((event) => {
  console.log(`Cache entry ${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

## API Reference

### Cache Management

#### Setting Cache Entries

```typescript
await RunCache.set({
  key: string,                         // Required: Unique identifier for the cache entry
  value?: string,                      // Optional: String value to cache (required if no sourceFn)
  ttl?: number,                        // Optional: Time-to-live in milliseconds
  autoRefetch?: boolean,               // Optional: Automatically refetch on expiry (requires ttl and sourceFn)
  sourceFn?: () => string | Promise<string>, // Optional: Function to generate cache value (required if no value)
  tags?: string[],                     // Optional: Array of tags for tag-based invalidation
  dependencies?: string[]              // Optional: Array of cache keys this entry depends on
});
```

#### Retrieving Cache Entries

```typescript
// Get a single cache entry
const value = await RunCache.get("cache-key");

// Get multiple entries using wildcards (returns an array)
const values = await RunCache.get("user-*");
```

#### Refreshing Cache

```typescript
// Manually refresh a cache entry (requires a sourceFn)
await RunCache.refetch("cache-key");

// Refresh multiple entries using wildcards
await RunCache.refetch("api-data-*");
```

#### Removing Cache Entries

```typescript
// Remove a specific entry
RunCache.delete("cache-key");

// Remove multiple entries using wildcards
RunCache.delete("temp-*");

// Remove all cache entries
RunCache.flush();
```

#### Tag and Dependency Management

```typescript
// Invalidate all entries with a specific tag
RunCache.invalidateByTag("user:123");

// Invalidate all entries dependent on a specific key
RunCache.invalidateByDependency("user:123:profile");

// Check if one key depends on another
const isDependency = await RunCache.isDependencyOf("dashboard:123", "user:123");
```

#### Checking Cache Status

```typescript
// Check if a valid (non-expired) cache entry exists
const exists = await RunCache.has("cache-key");

// Check if any matching cache entries exist
const hasItems = await RunCache.has("session-*");
```

#### Cache Configuration

```typescript
// Configure cache settings
RunCache.configure({
  maxEntries: 1000,                  // Maximum number of entries before eviction
  evictionPolicy: EvictionPolicy.LRU  // Eviction policy to use
});

// Get current configuration
const config = RunCache.getConfig();
```

### Event System

RunCache provides a comprehensive event system to monitor cache lifecycle events.

#### Expiry Events

```typescript
// Global expiry event
RunCache.onExpiry((event) => {
  console.log(`Cache key ${event.key} expired at ${new Date(event.updatedAt + event.ttl).toISOString()}`);
});

// Specific key expiry
RunCache.onKeyExpiry("api-data", (event) => {
  console.log(`API data cache expired`);
});

// Pattern-based expiry events
RunCache.onKeyExpiry("user-*", (event) => {
  console.log(`User cache ${event.key} expired`);
});
```

#### Refetch Events

```typescript
// Global refetch event
RunCache.onRefetch((event) => {
  console.log(`Cache key ${event.key} was refreshed`);
});

// Specific key refetch
RunCache.onKeyRefetch("weather-data", (event) => {
  console.log(`Weather data was refreshed`);
});

// Pattern-based refetch events
RunCache.onKeyRefetch("stats-*", (event) => {
  console.log(`Statistics for ${event.key} were refreshed`);
});
```

#### Refetch Failure Events

```typescript
// Global refetch failure event
RunCache.onRefetchFailure((event) => {
  console.error(`Failed to refresh cache key ${event.key}`);
});

// Specific key refetch failure
RunCache.onKeyRefetchFailure("api-data", (event) => {
  console.error(`API data refresh failed`);
});

// Pattern-based refetch failure events
RunCache.onKeyRefetchFailure("external-*", (event) => {
  console.error(`External data refresh failed for ${event.key}`);
});
```

#### Tag Invalidation Events

```typescript
// Global tag invalidation event
RunCache.onTagInvalidation((event) => {
  console.log(`Cache key ${event.key} was invalidated by tag: ${event.tag}`);
});

// Specific key tag invalidation
RunCache.onKeyTagInvalidation("user:profile:*", (event) => {
  console.log(`User profile cache was invalidated by tag: ${event.tag}`);
});
```

#### Dependency Invalidation Events

```typescript
// Global dependency invalidation event
RunCache.onDependencyInvalidation((event) => {
  console.log(`Cache key ${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});

// Specific key dependency invalidation
RunCache.onKeyDependencyInvalidation("dashboard:*", (event) => {
  console.log(`Dashboard cache was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

#### Managing Event Listeners

```typescript
// Remove all event listeners
RunCache.clearEventListeners();

// Remove listeners for a specific event type
RunCache.clearEventListeners({
  event: EVENT.EXPIRE
});

// Remove listeners for a specific key
RunCache.clearEventListeners({
  event: EVENT.REFETCH,
  key: "api-data"
});

// Remove listeners using wildcard patterns
RunCache.clearEventListeners({
  event: EVENT.REFETCH_FAILURE,
  key: "external-*"
});
```

### Middleware

RunCache supports middleware functions that can intercept and transform cache operations. This allows for powerful customizations like validation, normalization, encryption, or custom business logic.

#### Adding Middleware

```typescript
import { RunCache } from "run-cache";

// Add a simple logging middleware
RunCache.use(async (value, context, next) => {
  console.log(`${context.operation} operation for key: ${context.key}`);
  return next(value);
});
```

#### Encryption Middleware Example

```typescript
import { RunCache } from "run-cache";
import { encrypt, decrypt } from "./your-crypto-lib";

// Add encryption middleware
RunCache.use(async (value, context, next) => {
  if (context.operation === 'set' && value) {
    // Encrypt value before storing in cache
    return next(encrypt(value));
  } else if (context.operation === 'get' || context.operation === 'refetch') {
    // Decrypt value after retrieving from cache
    const encrypted = await next(value);
    return encrypted ? decrypt(encrypted) : undefined;
  }
  return next(value);
});

// Use cache normally - encryption/decryption happens transparently
await RunCache.set({ key: "sensitive-data", value: "secret-value" });
const value = await RunCache.get("sensitive-data"); // Returns decrypted "secret-value"
```

#### Chaining Multiple Middleware

Middleware functions are executed in the order they are added:

```typescript
// First middleware validates input
RunCache.use(async (value, context, next) => {
  if (context.operation === 'set' && (!value || value.length < 3)) {
    throw new Error("Value must be at least 3 characters");
  }
  return next(value);
});

// Second middleware adds a timestamp
RunCache.use(async (value, context, next) => {
  if (context.operation === 'set' && value) {
    return next(`${value}|${Date.now()}`);
  } else if (context.operation === 'get' && value) {
    const result = await next(value);
    return result?.split('|')[0]; // Remove timestamp on get
  }
  return next(value);
});
```

#### Clearing Middleware

```typescript
// Remove all middleware
RunCache.clearMiddleware();
```

For more detailed information on middleware, see the [middleware documentation](./docs/middleware.md).

## Wildcard Pattern Matching

RunCache supports wildcard pattern matching for operating on multiple related cache keys simultaneously. Use the `*` character as a wildcard in your key patterns.

### Pattern Matching Examples

```typescript
// Cache multiple related entries
await RunCache.set({ key: "user:1:profile", value: "Alice's data" });
await RunCache.set({ key: "user:2:profile", value: "Bob's data" });
await RunCache.set({ key: "user:1:preferences", value: "Alice's preferences" });
await RunCache.set({ key: "user:2:preferences", value: "Bob's preferences" });

// Get all user profiles
const profiles = await RunCache.get("user:*:profile");

// Get all data for user 1
const user1Data = await RunCache.get("user:1:*");

// Delete all preference data
RunCache.delete("user:*:preferences");

// Check if any user 2 data exists
const hasUser2Data = await RunCache.has("user:2:*");

// Refresh all profile data
await RunCache.refetch("user:*:profile");
```

Wildcard support is implemented for all key-based operations:
- `get`: Returns an array of values for matching keys
- `delete`: Removes all matching keys
- `refetch`: Refreshes all matching keys
- `has`: Returns true if any matching key exists
- Event listeners: Registers callbacks for keys matching patterns
- `clearEventListeners`: Removes listeners for keys matching patterns

## Resource Management

RunCache is designed to properly manage resources throughout the application lifecycle.

### Automatic Cleanup on Termination

RunCache automatically registers handlers for SIGTERM and SIGINT signals in Node.js environments to ensure proper cleanup of all resources when the application is shutting down. This prevents memory leaks and ensures a clean shutdown.

### Manual Shutdown

You can also manually trigger a complete shutdown of the cache:

```typescript
// Manually shut down the cache, clearing all entries, intervals, and event listeners
RunCache.shutdown();
```

The `shutdown` method performs the following cleanup:
- Clears all cache entries and their associated intervals
- Removes all event listeners
- Resets the cache configuration to default values

This is particularly useful in long-running applications or when you need to release resources manually.

## Debugging and Logging

RunCache provides built-in debug logging to help with debugging and monitoring cache behavior.

### debug Logging

Enable debug logging to see detailed information about all cache operations:

```typescript
// Enable debug logging when configuring the cache
RunCache.configure({
  debug: true
});
```

When debug mode is enabled, RunCache logs detailed information about:
- Cache operations (set, get, delete, etc.)
- Entry expiration and eviction
- Refetch operations and failures
- Configuration changes

All logs include timestamps and log levels for easy filtering.

```typescript
// Example of enabling debug logging for debugging
RunCache.configure({ debug: true });

// Perform some cache operations
await RunCache.set({ key: "user-1", value: "Alice" });
await RunCache.get("user-1");

// Disable debug logging when done debugging
RunCache.configure({ debug: false });
```

### Log Levels

Logs are output at different levels depending on their importance:
- `info`: General information about cache operations
- `debug`: Detailed information useful for debugging
- `warn`: Warnings about potential issues
- `error`: Errors that occurred during operations

This is useful when you want to filter logs in complex applications.

## Persistent Storage

RunCache now supports persisting cache data across application restarts using storage adapters. This allows you to maintain your cache state between sessions, improving user experience and reducing unnecessary API calls.

### Available Storage Adapters

RunCache includes three built-in storage adapters:

1. **LocalStorageAdapter**: For browser environments, uses the browser's localStorage API
2. **IndexedDBAdapter**: For browser environments, uses the browser's IndexedDB API for larger datasets
3. **FilesystemAdapter**: For Node.js environments, stores cache data in the filesystem

### Using Storage Adapters

To use a storage adapter, first import the adapter you want to use, then configure RunCache with it:

```typescript
import { RunCache, LocalStorageAdapter } from 'run-cache';

// Configure RunCache with LocalStorage persistence
RunCache.configure({
  storageAdapter: new LocalStorageAdapter({
    storageKey: 'my-app-cache' // Optional custom key
  })
});
```

### Auto-Saving and Manual Control

You can configure automatic saving at regular intervals:

```typescript
// Save cache to storage every 5 minutes (300,000 ms)
RunCache.setupAutoSave(300000);

// Disable auto-saving
RunCache.setupAutoSave(0);
```

You can also manually control when to save and load:

```typescript
// Manually save cache state
await RunCache.saveToStorage();

// Manually load cache state
await RunCache.loadFromStorage();
```

### Adapter Configuration Options

Each adapter accepts the following common options:

```typescript
interface StorageAdapterConfig {
  // Storage key/filename to use
  storageKey?: string; // Default: "run-cache-data"
  
  // Auto-save interval in milliseconds
  autoSaveInterval?: number; // Default: 0 (disabled)
  
  // Whether to load cache automatically when adapter is initialized
  autoLoadOnInit?: boolean; // Default: true
}
```

The FilesystemAdapter also accepts an additional option:

```typescript
// Custom file path (FilesystemAdapter only)
new FilesystemAdapter({
  filePath: '/custom/path/to/cache.json'
});
```

### Recovery Mechanism

When the application restarts, the cache state is automatically restored if:

1. A storage adapter is configured when initializing RunCache
2. The adapter contains valid cached data

This recovery happens automatically when you configure RunCache with a storage adapter. Any cache entries with TTL values will have their expiry timers properly restored based on their original expiration time.

### Example: Full Cache Persistence Setup

```typescript
import { RunCache, LocalStorageAdapter } from 'run-cache';

// Configure RunCache with persistence
RunCache.configure({
  maxEntries: 1000,
  evictionPolicy: EvictionPolicy.LRU,
  storageAdapter: new LocalStorageAdapter({
    storageKey: 'my-app-cache'
  })
});

// Set up auto-save every minute
RunCache.setupAutoSave(60000);

// When the app shuts down, the cache will be saved automatically
// When the app starts up, the cache will be loaded automatically
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
