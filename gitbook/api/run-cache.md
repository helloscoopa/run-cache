# RunCache API Reference

This page provides a complete reference for the RunCache class, including all methods, parameters, and return types.

## Class: RunCache

The main class that provides caching functionality. All methods are static and can be called directly on the RunCache class.

## Configuration Methods

### `configure(config)`

Configures the cache with global settings.

**Parameters:**

- `config`: `CacheConfig` - Configuration object with the following properties:
  - `maxEntries?`: `number` - Maximum number of entries before eviction (default: unlimited)
  - `evictionPolicy?`: `EvictionPolicy` - Eviction policy to use (default: NONE)
  - `debug?`: `boolean` - Enable debug logging (default: false)
  - `handleProcessSignals?`: `boolean` - Shut the cache down (saving to the storage adapter) on `SIGTERM`/`SIGINT` in Node.js and on `beforeunload` in browsers (default: false). In Node.js the signal is re-raised after shutdown unless your application has its own listener, so the process exits as it would without RunCache. Importing RunCache installs no handlers unless this is enabled.
  - `onListenerError?`: `(error, { event, key }) => void` - Receives errors thrown (or rejected) by event listeners. By default they are written to `console.error`; listener errors never reach the cache operation that emitted the event.
  - `storageAdapter?`: `StorageAdapter` - Storage adapter for persistence (default: none). Attaching an adapter loads the data it already holds; if a different adapter was attached before, the current entries are saved to it first, and `configure()` rejects (keeping that adapter) if the save fails. The `maxEntries` and `evictionPolicy` stored with the data are not applied. Pass `undefined` to detach persistence.

**Returns:** `Promise<void>` - resolves once the configuration is applied, including loading from a newly attached storage adapter

**Example:**

```typescript
import { RunCache, EvictionPolicy } from 'run-cache';

await RunCache.configure({
  maxEntries: 1000,
  evictionPolicy: EvictionPolicy.LRU,
  debug: true
});
```

### `getConfig()`

Gets the current cache configuration.

**Returns:** `Promise<CacheConfig>` - A copy of the current configuration

**Example:**

```typescript
const config = await RunCache.getConfig();
console.log(config); // { maxEntries: 1000, evictionPolicy: "LRU", debug: true }
```

## Cache Operations

### `set<T = string>(options)`

Sets a cache entry with the specified options. Strings are stored as-is; any other value is stored as JSON and parsed again by `get()`, so it must be JSON-serializable (see [Value Serialization](../advanced/serialization-adapters.md)).

**Type Parameters:**

- `T` - The type of value being cached (defaults to `string` for backward compatibility)

**Parameters:**

- `options`: `Object` - Cache entry options
  - `key`: `string` - Unique identifier for the cache entry
  - `value?`: `T` - Value to cache (required if no sourceFn). An empty string is a valid value.
  - `ttl?`: `number` - Time-to-live in milliseconds. Must be a finite, positive number; omit it for entries that never expire. TTLs longer than the `setTimeout` limit (about 24.8 days) are supported.
  - `autoRefetch?`: `boolean` - Automatically refetch on expiry (requires ttl and sourceFn)
  - `sourceFn?`: `() => T | Promise<T>` - Function to generate cache value (required if no value)
  - `tags?`: `string[]` - Array of tags for tag-based invalidation
  - `dependencies?`: `string[]` - Array of cache keys this entry depends on. The entry is invalidated automatically when any of them changes. Overwriting an existing key with `set()` also invalidates the entries that depend on it.

**Returns:** `Promise<boolean>` - Returns `true` if the value was successfully set. Returns `false` if another `set()` for the same key started later and has already written its value while this one was still waiting for its `sourceFn` or middleware; the newer value is kept. A later `set()` that fails does not affect an earlier one. `delete()` and `flush()` act on what is cached when they run, so they do not cancel a `set()` that is still waiting for its value.

**Throws:**
- `Error` - If key is empty
- `Error` - If neither value nor sourceFn is provided
- `Error` - If autoRefetch is true but ttl or sourceFn is not provided
- `Error` - If ttl is `0` or negative (`` `ttl` cannot be negative ``), not a number or `NaN` (`` `ttl` must be a number ``), or `Infinity` (`` `ttl` must be a finite number ``)
- `Error` - If `dependencies` contains the key itself, or would create a cycle (`Circular dependency detected`)
- `SourceFnError` - If the source function throws or rejects (the original error is in `error.cause`), or resolves to `undefined`
- `MiddlewareError` - If a middleware throws (original error in `error.cause`) or produces `undefined`

`SourceFnError` and `MiddlewareError` extend `RunCacheError`, which extends `Error` and also carries the cache `key`. All three are exported from `run-cache`.

**Example:**

```typescript
// Basic string usage (backward compatible)
await RunCache.set({ key: 'greeting', value: 'Hello, World!' });

// Typed object caching
interface User {
  id: number;
  name: string;
  email: string;
}

const user: User = { id: 1, name: 'John', email: 'john@example.com' };
await RunCache.set<User>({ key: 'user:1', value: user });

// Array caching with types
await RunCache.set<number[]>({ key: 'scores', value: [95, 87, 92] });

// With TTL (a Date would come back as a string, so store the ISO string)
await RunCache.set({
  key: 'last-update',
  value: new Date().toISOString(),
  ttl: 60000
});

// Typed source function
await RunCache.set<User>({
  key: 'api-user',
  sourceFn: async (): Promise<User> => {
    const response = await fetch('https://api.example.com/user');
    return response.json(); // Returns typed User object
  },
  ttl: 300000
});

// With auto-refetch and types
await RunCache.set<{ temperature: number; humidity: number }>({
  key: 'weather',
  sourceFn: () => fetchWeatherData(),
  ttl: 600000,
  autoRefetch: true
});

// With tags and dependencies
await RunCache.set<User>({
  key: 'user:1:profile',
  value: user,
  tags: ['user:1', 'profile'],
  dependencies: ['user:1:session']
});
```

### `get<T = string>(key)`

Retrieves a cache entry by key or pattern with full type safety.

**Type Parameters:**

- `T` - The expected type of the cached value (defaults to `string` for backward compatibility)

**Parameters:**

- `key`: `string` - The key to retrieve, or a pattern with wildcards

**Returns:** `Promise<T | T[] | undefined>`
- If `key` is a specific key, returns the typed value or undefined if not found
- If `key` is a pattern, returns an array of matching typed values

Values stored as strings are returned unchanged, even if they look like JSON (`"123"`, `"true"`, `'{"a":1}'`). Only values that were stored from non-string types are deserialized.

**Example:**

```typescript
// Get a specific string entry (backward compatible)
const greeting = await RunCache.get('greeting');
console.log(greeting); // "Hello, World!"

// Get typed object
interface User {
  id: number;
  name: string;
  email: string;
}

const user = await RunCache.get<User>('user:1');
if (user) {
  console.log(user.name); // TypeScript knows this is a string
  console.log(user.id); // TypeScript knows this is a number
}

// Get typed array
const scores = await RunCache.get<number[]>('scores');
if (scores) {
  const average = scores.reduce((a, b) => a + b) / scores.length;
}

// Get entries matching a pattern with types
const userProfiles = await RunCache.get<User>('user:*:profile');
if (Array.isArray(userProfiles)) {
  userProfiles.forEach(profile => {
    console.log(`User: ${profile.name} (${profile.email})`);
  });
}

// Complex typed retrieval
interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: number;
}

const response = await RunCache.get<ApiResponse<User[]>>('api:users');
if (response?.success) {
  response.data.forEach(user => console.log(user.name));
}
```

### `has(key)`

Checks if a valid (non-expired) cache entry exists.

**Parameters:**

- `key`: `string` - The key to check, or a pattern with wildcards

**Returns:** `Promise<boolean>`
- If `key` is a specific key, returns true if it exists and hasn't expired
- If `key` is a pattern, returns true if any matching key exists

**Example:**

```typescript
// Check if a specific key exists
const hasGreeting = await RunCache.has('greeting');
console.log(hasGreeting); // true or false

// Check if any keys match a pattern
const hasUserData = await RunCache.has('user:1:*');
console.log(hasUserData); // true or false
```

### `delete(key)`

Removes a cache entry or entries matching a pattern.

**Parameters:**

- `key`: `string` - The key to delete, or a pattern with wildcards

**Returns:** `Promise<boolean>` - `true` if at least one entry was deleted

**Example:**

```typescript
// Delete a specific entry
await RunCache.delete('greeting');

// Delete entries matching a pattern
await RunCache.delete('user:1:*');
```

### `flush()`

Removes all cache entries.

**Returns:** `Promise<void>`

**Example:**

```typescript
// Clear the entire cache
await RunCache.flush();
```

### `refetch(key)`

Manually refreshes a cache entry or entries matching a pattern by running their stored `sourceFn`.

**Parameters:**

- `key`: `string` - The key to refresh, or a pattern with wildcards

**Returns:** `Promise<boolean>`
- `true` if the entry (or, for a pattern, at least one matching entry) was refreshed
- `false` if the key does not exist, has no source function, is already being refetched, or was changed while its source function was running

If an entry is deleted, flushed, evicted, invalidated or overwritten with `set()` while its refetch is in progress, the refetch result is discarded. The entry is not re-created and no `refetch` event is emitted.

**Throws:**
- `SourceFnError` - If the source function of a single key throws or resolves to `undefined`. The original error is in `error.cause`, the previous value stays in the cache, and a `refetch_failure` event is emitted with the same error in `event.error`.
- `MiddlewareError` - If a middleware throws (original error in `error.cause`) or produces `undefined` for the new value. The previous value stays in the cache.

**Example:**

```typescript
// Refresh a specific entry
await RunCache.refetch('api-data');

// Refresh entries matching a pattern
await RunCache.refetch('user:*:profile');

```

## Tag Operations

### `invalidateByTag(tag)`

Invalidates all cache entries with the specified tag.

**Parameters:**

- `tag`: `string` - The tag to invalidate

**Returns:** `Promise<boolean>` - `true` if at least one entry was invalidated

**Example:**

```typescript
// Invalidate all entries with the 'user:1' tag
await RunCache.invalidateByTag('user:1');
```

## Dependency Operations

### `invalidateByDependency(key)`

Invalidates all entries that depend on `key`, directly or indirectly. The entry for `key` itself is kept. Each invalidated entry emits a `dependency_invalidation` event with `dependencyKey` set to `key`.

You only need this to invalidate dependents explicitly. The same cascade runs automatically when `key` is updated with `set()`, refetched, deleted, evicted, invalidated by tag or expires.

**Parameters:**

- `key`: `string` - The key whose dependents should be invalidated

**Returns:** `Promise<boolean>` - `true` if at least one entry was invalidated

**Example:**

```typescript
// Invalidate every entry that depends on 'user:1:profile'
await RunCache.invalidateByDependency('user:1:profile');
```

### `isDependencyOf(key, dependencyKey)`

Checks if one entry depends on another (directly or indirectly).

**Parameters:**

- `key`: `string` - The key to check
- `dependencyKey`: `string` - The potential dependency key

**Returns:** `Promise<boolean>` - True if key depends on dependencyKey. Returns false if `key`, or an intermediate entry in the chain, does not exist or has expired.

This is a read-only check: it does not count as an access for eviction, emit events or remove expired entries.

**Example:**

```typescript
// Check if 'dashboard' depends on 'user:1:profile'
const isDependency = await RunCache.isDependencyOf('dashboard', 'user:1:profile');
console.log(isDependency); // true or false
```

## Event System

### `onExpiry(callback)`

Registers a callback for all expiry events.

**Parameters:**

- `callback`: `(event: EventParam) => void | Promise<void>` - Function to call when any entry expires

**Returns:** `Promise<void>`

**Example:**

```typescript
await RunCache.onExpiry((event) => {
  console.log(`Cache key ${event.key} expired`);
});
```

### `onKeyExpiry(key, callback)`

Registers a callback for expiry events for a specific key or pattern.

**Parameters:**

- `key`: `string` - The key or pattern to watch
- `callback`: `(event: EventParam) => void | Promise<void>` - Function to call when matching entries expire

**Returns:** `Promise<void>`

**Example:**

```typescript
await RunCache.onKeyExpiry('api-data', (event) => {
  console.log('API data expired');
});

await RunCache.onKeyExpiry('user:*:profile', (event) => {
  console.log(`User profile ${event.key} expired`);
});
```

### `onRefetch(callback)`

Registers a callback for all refetch events.

**Parameters:**

- `callback`: `(event: EventParam) => void | Promise<void>` - Function to call when any entry is refreshed

**Returns:** `Promise<void>`

**Example:**

```typescript
await RunCache.onRefetch((event) => {
  console.log(`Cache key ${event.key} was refreshed`);
});
```

### `onKeyRefetch(key, callback)`

Registers a callback for refetch events for a specific key or pattern.

**Parameters:**

- `key`: `string` - The key or pattern to watch
- `callback`: `(event: EventParam) => void | Promise<void>` - Function to call when matching entries are refreshed

**Returns:** `Promise<void>`

**Example:**

```typescript
await RunCache.onKeyRefetch('weather-data', (event) => {
  console.log('Weather data was refreshed');
});
```

### `onRefetchFailure(callback)`

Registers a callback for all refetch failure events.

**Parameters:**

- `callback`: `(event: EventParam) => void | Promise<void>` - Function to call when any refresh fails

**Returns:** `Promise<void>`

**Example:**

```typescript
await RunCache.onRefetchFailure((event) => {
  console.error(`Failed to refresh ${event.key}:`, event.error);
});
```

### `onKeyRefetchFailure(key, callback)`

Registers a callback for refetch failure events for a specific key or pattern.

**Parameters:**

- `key`: `string` - The key or pattern to watch
- `callback`: `(event: EventParam) => void | Promise<void>` - Function to call when matching refreshes fail

**Returns:** `Promise<void>`

**Example:**

```typescript
await RunCache.onKeyRefetchFailure('api-data', (event) => {
  console.error(`API data refresh failed: ${event.key}`, event.error);
});
```

### `onTagInvalidation(callback)`

Registers a callback for all tag invalidation events.

**Parameters:**

- `callback`: `(event: EventParam) => void | Promise<void>` - Function to call when any entry is invalidated by tag

**Returns:** `Promise<void>`

**Example:**

```typescript
await RunCache.onTagInvalidation((event) => {
  console.log(`${event.key} was invalidated by tag: ${event.tag}`);
});
```

### `onKeyTagInvalidation(key, callback)`

Registers a callback for tag invalidation events for a specific key or pattern.

**Parameters:**

- `key`: `string` - The key or pattern to watch
- `callback`: `(event: EventParam) => void | Promise<void>` - Function to call when matching entries are invalidated by tag

**Returns:** `Promise<void>`

**Example:**

```typescript
await RunCache.onKeyTagInvalidation('user:*:profile', (event) => {
  console.log(`User profile ${event.key} was invalidated by tag: ${event.tag}`);
});
```

### `onDependencyInvalidation(callback)`

Registers a callback for all dependency invalidation events.

**Parameters:**

- `callback`: `(event: EventParam) => void | Promise<void>` - Function to call when any entry is invalidated by dependency

**Returns:** `Promise<void>`

**Example:**

```typescript
await RunCache.onDependencyInvalidation((event) => {
  console.log(`${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

### `onKeyDependencyInvalidation(key, callback)`

Registers a callback for dependency invalidation events for a specific key or pattern.

**Parameters:**

- `key`: `string` - The key or pattern to watch
- `callback`: `(event: EventParam) => void | Promise<void>` - Function to call when matching entries are invalidated by dependency

**Returns:** `Promise<void>`

**Example:**

```typescript
await RunCache.onKeyDependencyInvalidation('dashboard:*', (event) => {
  console.log(`Dashboard ${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

### `clearEventListeners(options?)`

Removes event listeners based on the specified options.

**Parameters:**

- `options?`: `Object` - Options to specify which listeners to remove. With no options, every listener is removed; an object that selects nothing (`{}`) removes nothing.
  - `event?`: `EventName` - The event type to remove listeners for. Only that exact event is affected; for example, clearing `EVENT.REFETCH` keeps `EVENT.REFETCH_FAILURE` listeners.
  - `key?`: `string` - The key or wildcard pattern to remove listeners for. Without `event`, the key's listeners are removed for every event type. An exact key does not remove wildcard listeners that match it.

**Returns:** `Promise<void>`

**Example:**

```typescript
// Remove all event listeners
await RunCache.clearEventListeners();

// Remove all expiry listeners
await RunCache.clearEventListeners({ event: EVENT.EXPIRE });

// Remove listeners for a specific key
await RunCache.clearEventListeners({ key: 'api-data' });

// Remove specific event listeners for a key
await RunCache.clearEventListeners({ event: EVENT.REFETCH, key: 'api-data' });
```

## Middleware

### `use(middleware)`

Adds a middleware function to intercept and transform cache operations.

**Parameters:**

- `middleware`: `MiddlewareFunction` - The middleware function to add

**Returns:** `Promise<void>`

**Example:**

```typescript
// Add a logging middleware
await RunCache.use(async (value, context, next) => {
  console.log(`${context.operation} operation for key: ${context.key}`);
  return next(value);
});

// Add an encryption middleware
await RunCache.use(async (value, context, next) => {
  if ((context.operation === 'set' || context.operation === 'refetch') && value) {
    return next(encrypt(value));
  } else if (context.operation === 'get' && value) {
    const encrypted = await next(value);
    return encrypted ? decrypt(encrypted) : undefined;
  }
  return next(value);
});
```

### `clearMiddleware()`

Removes all middleware functions.

**Returns:** `Promise<void>`

**Example:**

```typescript
// Remove all middleware
await RunCache.clearMiddleware();
```

## Storage Operations

### `setupAutoSave(interval)`

Configures automatic saving to persistent storage.

**Parameters:**

- `interval`: `number` - The interval in milliseconds between saves (0 to disable)

**Returns:** `Promise<void>`

**Example:**

```typescript
// Save cache to storage every 5 minutes
await RunCache.setupAutoSave(300000);

// Disable auto-saving
await RunCache.setupAutoSave(0);
```

### `saveToStorage()`

Manually saves the cache state to persistent storage. Expired entries and source functions are not saved.

**Returns:** `Promise<boolean>` - `true` if the data was saved, `false` if no storage adapter is configured or the adapter failed

**Example:**

```typescript
// Manually save cache state
await RunCache.saveToStorage();
```

### `loadFromStorage()`

Manually loads the cache state from persistent storage and merges it into the cache. Keys that already exist in memory keep their current value, expired stored entries are skipped, and each restored entry expires after the time remaining on its original TTL. The stored `maxEntries` and `evictionPolicy` are not applied.

Because loading merges, it does not undo changes made since the last save. To return to exactly the saved state, call `flush()` first, then `loadFromStorage()`.

**Returns:** `Promise<boolean>` - `true` if data was found and loaded, `false` otherwise

**Example:**

```typescript
// Manually load cache state
await RunCache.loadFromStorage();
```

### `createTypedCache<T>()`

Creates a typed cache interface that provides type-safe operations for a specific type.

**Type Parameters:**

- `T` - The type of values that will be cached

**Returns:** A typed wrapper around the same global cache. See [Typed Cache Interface](typed-cache-interface.md).

**Example:**

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

interface Product {
  id: number;
  name: string;
  price: number;
}

// Create typed cache instances
const userCache = RunCache.createTypedCache<User>();
const productCache = RunCache.createTypedCache<Product>();

// All operations are now strongly typed
await userCache.set({
  key: 'user:123',
  value: { id: 123, name: 'John', email: 'john@example.com' }
});

await productCache.set({
  key: 'product:456',
  value: { id: 456, name: 'Laptop', price: 999.99 }
});

// Type-safe retrieval
const user = await userCache.get('user:123'); // User | User[] | undefined (an array for wildcard keys)
const product = await productCache.get('product:456'); // Product | Product[] | undefined

// TypeScript will enforce correct types
// userCache.set({ key: 'test', value: { wrong: 'type' } }); // ❌ Type error
```

## Resource Management

### `shutdown()`

Shuts down the cache: saves to the storage adapter (if one is configured), then clears all entries, timers and event listeners, removes any handlers installed with `handleProcessSignals`, and resets the configuration to its defaults.

**Returns:** `Promise<void>`

**Example:**

```typescript
// Shut down the cache
await RunCache.shutdown();

// Or let RunCache do it when the process receives SIGTERM/SIGINT
await RunCache.configure({ handleProcessSignals: true });
```

## Enums

### `EvictionPolicy`

Enum for cache eviction policies:

- `NONE`: No automatic eviction
- `LRU`: Least Recently Used
- `LFU`: Least Frequently Used

**Example:**

```typescript
import { RunCache, EvictionPolicy } from 'run-cache';

await RunCache.configure({
  evictionPolicy: EvictionPolicy.LRU
});
```

### `EVENT`

Enum for event types:

- `EXPIRE`: Expiry events
- `REFETCH`: Refetch events
- `REFETCH_FAILURE`: Refetch failure events
- `TAG_INVALIDATION`: Tag invalidation events
- `DEPENDENCY_INVALIDATION`: Dependency invalidation events

**Example:**

```typescript
import { RunCache, EVENT } from 'run-cache';

await RunCache.clearEventListeners({
  event: EVENT.EXPIRE
});
```

## Type Definitions

The exported types (`CacheConfig`, `EventParam`, `EventName`, `MiddlewareFunction`, `MiddlewareContext`, `StorageAdapter`, `StorageAdapterConfig`) and the `EvictionPolicy` enum are documented in [Types](types.md).
