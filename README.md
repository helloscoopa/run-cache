[![npm-version](https://img.shields.io/npm/v/run-cache)](https://www.npmjs.com/package/run-cache)
[![license](https://img.shields.io/github/license/helloscoopa/run-cache)](https://github.com/helloscoopa/run-cache?tab=MIT-1-ov-file)
[![ci-build](https://img.shields.io/github/actions/workflow/status/helloscoopa/run-cache/build.yml?label=build)](https://github.com/helloscoopa/run-cache/actions/workflows/build.yml)
[![ci-tests](https://img.shields.io/github/actions/workflow/status/helloscoopa/run-cache/tests.yml?label=tests)](https://github.com/helloscoopa/run-cache/actions/workflows/tests.yml)
[![coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhelloscoopa%2Frun-cache%2Fbadges%2Fcoverage.json)](https://github.com/helloscoopa/run-cache/actions/workflows/tests.yml)

# RunCache

A dependency-free, lightweight runtime caching library for JavaScript and TypeScript applications. RunCache allows you to cache strings and other JSON-serializable values with configurable time-to-live (TTL) settings and supports automatic value regeneration through source functions.

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

RunCache ships CommonJS and ES module builds and works in Node.js and in browsers:

```typescript
import { RunCache } from 'run-cache';        // ES modules and bundlers (webpack, Vite, Rollup, esbuild)
const { RunCache } = require('run-cache');   // CommonJS
```

For use without a bundler, a minified ES module build is available from a CDN:

```html
<script type="module">
  import { RunCache } from 'https://unpkg.com/run-cache/dist/index.min.js';
</script>
```

## Quick Start

```typescript
import { RunCache } from "run-cache";

// Basic caching
await RunCache.set({ key: "user-profile", value: { name: "John Doe" } });
const profile = await RunCache.get("user-profile");

// Cache with expiration (TTL in milliseconds)
await RunCache.set({
  key: "api-data",
  value: { data: [1, 2, 3] },
  ttl: 60000 // 1 minute
});

// Cache with automatic refresh
await RunCache.set({
  key: "weather-data",
  sourceFn: async () => await fetchWeatherData(),
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
- **LRU (Least Recently Used)**: Removes the least recently used entries when the cache exceeds its maximum size. Both writes (`set()`) and reads (`get()`, `has()`) count as a use, so newly written entries are kept ahead of entries that have not been touched for longer.
- **LFU (Least Frequently Used)**: Removes the least frequently accessed entries when the cache exceeds its maximum size. When entries have the same access frequency, the oldest entry is removed first.

### Configuring Eviction Policies

```typescript
import { RunCache, EvictionPolicy } from "run-cache";

// Configure the cache with a max size of 100 entries and LRU eviction policy
await RunCache.configure({
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
await RunCache.configure({
  evictionPolicy: EvictionPolicy.LFU
});

// Get the current configuration
const config = await RunCache.getConfig();
console.log(config); // { maxEntries: 100, evictionPolicy: "lfu" }
```

## Tag-based Invalidation

RunCache supports tagging cache entries and invalidating groups of related entries using tags.

```typescript
// Set entries with tags
await RunCache.set({
  key: "user:123:profile",
  value: { name: "John Doe" },
  tags: ["user:123", "profile"]
});

await RunCache.set({
  key: "user:123:settings",
  value: { theme: "dark" },
  tags: ["user:123", "settings"]
});

await RunCache.set({
  key: "user:123:posts",
  value: [{ id: 1, title: "Hello" }],
  tags: ["user:123", "posts"]
});

// Later, when user data changes, invalidate all related cache entries with a single call
await RunCache.invalidateByTag("user:123");

// This removes all three entries with the "user:123" tag

// You can also listen for tag invalidation events
await RunCache.onTagInvalidation((event) => {
  console.log(`Cache entry ${event.key} was invalidated by tag: ${event.tag}`);
});
```

## Dependency Tracking

RunCache enables establishing dependency relationships between cache entries with automatic cascading invalidation.

```typescript
// Set the primary data cache
await RunCache.set({
  key: "user:123:profile",
  value: { name: "John Doe" }
});

// Set dependent caches that rely on the profile data
await RunCache.set({
  key: "user:123:dashboard",
  value: { widgets: [...] },
  dependencies: ["user:123:profile"]
});

await RunCache.set({
  key: "user:123:recommendations",
  value: [...],
  dependencies: ["user:123:profile"]
});

// Create multi-level dependencies
await RunCache.set({
  key: "home:feed",
  value: [...],
  dependencies: ["user:123:recommendations"]
});

// Check if one entry depends on another (directly or indirectly)
const isDependency = await RunCache.isDependencyOf("home:feed", "user:123:profile");
console.log(isDependency); // true

// When the primary data changes, invalidate dependent entries with cascading effect
await RunCache.invalidateByDependency("user:123:profile");

// This will invalidate all dependent entries, including nested dependencies:
// - user:123:dashboard
// - user:123:recommendations
// - home:feed (because it depends on user:123:recommendations)

// You can also listen for dependency invalidation events
await RunCache.onDependencyInvalidation((event) => {
  console.log(`Cache entry ${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

Invalidation also cascades automatically. Dependents (direct and indirect) are removed when the entry they depend on is updated with `set()`, refetched, deleted, evicted, invalidated by tag or expires. Setting a key for the first time does not invalidate anything. `invalidateByDependency(key)` removes the dependents but keeps `key` itself. Circular dependencies are rejected: `set()` throws `Circular dependency detected`.

## API Reference

### Cache Management

#### Setting Cache Entries

```typescript
await RunCache.set({
  key: string,                         // Required: Unique identifier for the cache entry
  value?: string,                      // Optional: String value to cache, '' allowed (required if no sourceFn)
  ttl?: number,                        // Optional: Time-to-live in milliseconds (finite and > 0; any length, including > 24.8 days)
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

`refetch()` resolves to `false` (and stores nothing) if the entry is deleted, invalidated or overwritten while its source function is running.

#### Removing Cache Entries

```typescript
// Remove a specific entry
await RunCache.delete("cache-key");

// Remove multiple entries using wildcards
await RunCache.delete("temp-*");

// Remove all cache entries
await RunCache.flush();
```

#### Tag and Dependency Management

```typescript
// Invalidate all entries with a specific tag
await RunCache.invalidateByTag("user:123");

// Invalidate all entries dependent on a specific key
await RunCache.invalidateByDependency("user:123:profile");

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
await RunCache.configure({
  maxEntries: 1000,                  // Maximum number of entries before eviction
  evictionPolicy: EvictionPolicy.LRU  // Eviction policy to use
});

// Get current configuration
const config = await RunCache.getConfig();
```

### Event System

RunCache provides a comprehensive event system to monitor cache lifecycle events.

Listeners are isolated from cache operations: if a listener throws or rejects, the error is logged with `console.error`, the other listeners still run, and the cache operation completes normally. For invalidation events, the entry has already been removed when the listener runs.

#### Expiry Events

```typescript
// Global expiry event
await RunCache.onExpiry((event) => {
  console.log(`Cache key ${event.key} expired at ${new Date(event.updatedAt + event.ttl).toISOString()}`);
});

// Specific key expiry
await RunCache.onKeyExpiry("api-data", (event) => {
  console.log(`API data cache expired`);
});

// Pattern-based expiry events
await RunCache.onKeyExpiry("user-*", (event) => {
  console.log(`User cache ${event.key} expired`);
});
```

Expiry events carry the entry's stored `value`, `ttl`, `createdAt` and `updatedAt`, and are emitted once per expiry.

#### Refetch Events

```typescript
// Global refetch event
await RunCache.onRefetch((event) => {
  console.log(`Cache key ${event.key} was refreshed`);
});

// Specific key refetch
await RunCache.onKeyRefetch("weather-data", (event) => {
  console.log(`Weather data was refreshed`);
});

// Pattern-based refetch events
await RunCache.onKeyRefetch("stats-*", (event) => {
  console.log(`Statistics for ${event.key} were refreshed`);
});
```

#### Refetch Failure Events

```typescript
// Global refetch failure event
await RunCache.onRefetchFailure((event) => {
  console.error(`Failed to refresh cache key ${event.key}`);
});

// Specific key refetch failure
await RunCache.onKeyRefetchFailure("api-data", (event) => {
  console.error(`API data refresh failed`);
});

// Pattern-based refetch failure events
await RunCache.onKeyRefetchFailure("external-*", (event) => {
  console.error(`External data refresh failed for ${event.key}`);
});
```

#### Tag Invalidation Events

```typescript
// Global tag invalidation event
await RunCache.onTagInvalidation((event) => {
  console.log(`Cache key ${event.key} was invalidated by tag: ${event.tag}`);
});

// Specific key tag invalidation
await RunCache.onKeyTagInvalidation("user:profile:*", (event) => {
  console.log(`User profile cache was invalidated by tag: ${event.tag}`);
});
```

#### Dependency Invalidation Events

```typescript
// Global dependency invalidation event
await RunCache.onDependencyInvalidation((event) => {
  console.log(`Cache key ${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});

// Specific key dependency invalidation
await RunCache.onKeyDependencyInvalidation("dashboard:*", (event) => {
  console.log(`Dashboard cache was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

#### Managing Event Listeners

```typescript
// Remove all event listeners
await RunCache.clearEventListeners();

// Remove listeners for a specific event type
await RunCache.clearEventListeners({
  event: EVENT.EXPIRE
});

// Remove listeners for a specific key
await RunCache.clearEventListeners({
  event: EVENT.REFETCH,
  key: "api-data"
});

// Remove listeners using wildcard patterns
await RunCache.clearEventListeners({
  event: EVENT.REFETCH_FAILURE,
  key: "external-*"
});

// Remove all listeners for a key, across every event type
await RunCache.clearEventListeners({ key: "api-data" });
```

`clearEventListeners()` resolves to `true` if at least one listener was removed and `false` otherwise. Clearing one event type never affects another; for example, clearing `EVENT.REFETCH` keeps `EVENT.REFETCH_FAILURE` listeners.

### Middleware

RunCache supports middleware functions that can intercept and transform cache operations. This allows for powerful customizations like validation, normalization, encryption, or custom business logic.

#### Adding Middleware

```typescript
import { RunCache } from "run-cache";

// Add a simple logging middleware
await RunCache.use(async (value, context, next) => {
  console.log(`${context.operation} operation for key: ${context.key}`);
  return next(value);
});
```

#### Encryption Middleware Example

```typescript
import { RunCache } from "run-cache";
import { encrypt, decrypt } from "./your-crypto-lib";

// Add encryption middleware
await RunCache.use(async (value, context, next) => {
  if ((context.operation === 'set' || context.operation === 'refetch') && value) {
    // Encrypt value before storing in cache
    return next(encrypt(value));
  } else if (context.operation === 'get') {
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
await RunCache.use(async (value, context, next) => {
  if (context.operation === 'set' && (!value || value.length < 3)) {
    throw new Error("Value must be at least 3 characters");
  }
  return next(value);
});

// Second middleware adds a timestamp
await RunCache.use(async (value, context, next) => {
  if ((context.operation === 'set' || context.operation === 'refetch') && value) {
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
await RunCache.clearMiddleware();
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
await RunCache.delete("user:*:preferences");

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

### Cleanup on Termination

Importing RunCache does not install any process or window handlers. To have RunCache shut down (and save to its storage adapter) when the process is terminating, opt in:

```typescript
await RunCache.configure({ handleProcessSignals: true });
```

In Node.js this listens for SIGTERM and SIGINT, awaits `RunCache.shutdown()`, and then re-raises the signal unless your application has its own listener for it, so the process exits the same way it would without RunCache. In browsers it calls `RunCache.shutdown()` on `beforeunload` (best effort, since browsers do not wait for asynchronous work during unload).

If your application already handles these signals, leave the option off and call `await RunCache.shutdown()` from your own handler instead.

### Manual Shutdown

You can also manually trigger a complete shutdown of the cache:

```typescript
// Manually shut down the cache, clearing all entries, intervals, and event listeners
await RunCache.shutdown();
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
await RunCache.configure({
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
await RunCache.configure({ debug: true });

// Perform some cache operations
await RunCache.set({ key: "user-1", value: "Alice" });
await RunCache.get("user-1");

// Disable debug logging when done debugging
await RunCache.configure({ debug: false });
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
await RunCache.configure({
  storageAdapter: new LocalStorageAdapter({
    storageKey: 'my-app-cache' // Optional custom key
  })
});
```

Configuring an adapter loads any data it already holds, so `await` the call before reading from the cache. If another adapter was configured before, the current entries are saved to that adapter first; if that save fails, `configure()` rejects and the current adapter stays attached. The options passed to `configure()` always take precedence over the configuration stored with the data. Pass `storageAdapter: undefined` to detach persistence.

### Auto-Saving and Manual Control

You can configure automatic saving at regular intervals:

```typescript
// Save cache to storage every 5 minutes (300,000 ms)
await RunCache.setupAutoSave(300000);

// Disable auto-saving
await RunCache.setupAutoSave(0);
```

You can also manually control when to save and load:

```typescript
// Manually save cache state
await RunCache.saveToStorage();

// Manually load cache state
await RunCache.loadFromStorage();
```

### Adapter Configuration Options

Each adapter accepts the following options:

```typescript
interface StorageAdapterConfig {
  // Storage key/filename to use
  storageKey?: string; // Default: "run-cache-data"

  // Auto-save interval in milliseconds, applied when the adapter is attached
  autoSaveInterval?: number; // Default: 0 (disabled)

  // Whether to load existing data when the adapter is attached
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

This recovery happens automatically when you configure RunCache with a storage adapter (unless the adapter sets `autoLoadOnInit: false`). Restored entries:

- are merged into the cache; keys already in memory keep their current value,
- continue their original TTL (expiry timers are re-armed for the time remaining), and entries that expired while stored are skipped,
- keep your runtime configuration (`maxEntries`, `evictionPolicy`); the stored configuration is not applied,
- have no source function, because source functions are never written to storage. Call `set()` with a `sourceFn` again to make them refetchable.

The FilesystemAdapter writes atomically (temporary file plus rename), so an interrupted save never corrupts the stored cache.

### Example: Full Cache Persistence Setup

```typescript
import { RunCache, EvictionPolicy, LocalStorageAdapter } from 'run-cache';

// Configure RunCache with persistence; this also loads the saved entries
await RunCache.configure({
  maxEntries: 1000,
  evictionPolicy: EvictionPolicy.LRU,
  storageAdapter: new LocalStorageAdapter({
    storageKey: 'my-app-cache',
    autoSaveInterval: 60000 // save every minute
  }),
  // Save via RunCache.shutdown() on SIGINT/SIGTERM (Node.js) or page unload (browser)
  handleProcessSignals: true
});

// Or save explicitly before your app exits
await RunCache.shutdown();
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
