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
  - `storageAdapter?`: `StorageAdapter` - Storage adapter for persistence (default: none)

**Returns:** `void`

**Example:**

```typescript
import { RunCache, EvictionPolicy } from 'run-cache';

RunCache.configure({
  maxEntries: 1000,
  evictionPolicy: EvictionPolicy.LRU,
  debug: true
});
```

### `getConfig()`

Gets the current cache configuration.

**Returns:** `CacheConfig` - The current configuration object

**Example:**

```typescript
const config = RunCache.getConfig();
console.log(config); // { maxEntries: 1000, evictionPolicy: "lru", debug: true }
```

## Cache Operations

### `set<T = string>(options)`

Sets a cache entry with the specified options. Supports any serializable JavaScript type.

**Type Parameters:**

- `T` - The type of value being cached (defaults to `string` for backward compatibility)

**Parameters:**

- `options`: `Object` - Cache entry options
  - `key`: `string` - Unique identifier for the cache entry
  - `value?`: `T` - Value to cache (required if no sourceFn)
  - `ttl?`: `number` - Time-to-live in milliseconds
  - `autoRefetch?`: `boolean` - Automatically refetch on expiry (requires ttl and sourceFn)
  - `sourceFn?`: `() => T | Promise<T>` - Function to generate cache value (required if no value)
  - `tags?`: `string[]` - Array of tags for tag-based invalidation
  - `dependencies?`: `string[]` - Array of cache keys this entry depends on
  - `metadata?`: `any` - Custom metadata to associate with the entry
  - `validator?`: `TypeValidator<T>` - Optional type validator for runtime checking
  - `validateOnSet?`: `boolean` - Validate value before caching (default: false)

**Returns:** `Promise<boolean>` - Returns `true` if the value was successfully set

**Throws:**
- `Error` - If key is empty
- `Error` - If neither value nor sourceFn is provided
- `Error` - If autoRefetch is true but ttl or sourceFn is not provided

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

// With TTL and types
await RunCache.set<Date>({ 
  key: 'last-update', 
  value: new Date(), 
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

// With tags, dependencies, and validation
import { userValidator } from './validators';

await RunCache.set<User>({
  key: 'user:1:profile',
  value: user,
  tags: ['user:1', 'profile'],
  dependencies: ['user:1:session'],
  validator: userValidator,
  validateOnSet: true
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

**Returns:** `void`

**Example:**

```typescript
// Delete a specific entry
RunCache.delete('greeting');

// Delete entries matching a pattern
RunCache.delete('user:1:*');
```

### `flush()`

Removes all cache entries.

**Returns:** `void`

**Example:**

```typescript
// Clear the entire cache
RunCache.flush();
```

### `refetch(key, options?)`

Manually refreshes a cache entry or entries matching a pattern.

**Parameters:**

- `key`: `string` - The key to refresh, or a pattern with wildcards
- `options?`: `Object` - Optional refresh options
  - `metadata?`: `any` - Custom metadata to include in refetch events

**Returns:** `Promise<void>`

**Throws:**
- `Error` - If no matching entries have source functions

**Example:**

```typescript
// Refresh a specific entry
await RunCache.refetch('api-data');

// Refresh entries matching a pattern
await RunCache.refetch('user:*:profile');

// Refresh with metadata
await RunCache.refetch('api-data', { metadata: { reason: 'manual' } });
```

## Tag Operations

### `invalidateByTag(tag)`

Invalidates all cache entries with the specified tag.

**Parameters:**

- `tag`: `string` - The tag to invalidate

**Returns:** `void`

**Example:**

```typescript
// Invalidate all entries with the 'user:1' tag
RunCache.invalidateByTag('user:1');
```

## Dependency Operations

### `invalidateByDependency(key)`

Invalidates a cache entry and all entries that depend on it.

**Parameters:**

- `key`: `string` - The key to invalidate

**Returns:** `void`

**Example:**

```typescript
// Invalidate 'user:1:profile' and all entries that depend on it
RunCache.invalidateByDependency('user:1:profile');
```

### `isDependencyOf(key, dependencyKey)`

Checks if one entry depends on another (directly or indirectly).

**Parameters:**

- `key`: `string` - The key to check
- `dependencyKey`: `string` - The potential dependency key

**Returns:** `Promise<boolean>` - True if key depends on dependencyKey

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

- `callback`: `(event: ExpiryEvent) => void` - Function to call when any entry expires

**Returns:** `void`

**Example:**

```typescript
RunCache.onExpiry((event) => {
  console.log(`Cache key ${event.key} expired`);
});
```

### `onKeyExpiry(key, callback)`

Registers a callback for expiry events for a specific key or pattern.

**Parameters:**

- `key`: `string` - The key or pattern to watch
- `callback`: `(event: ExpiryEvent) => void` - Function to call when matching entries expire

**Returns:** `void`

**Example:**

```typescript
RunCache.onKeyExpiry('api-data', (event) => {
  console.log('API data expired');
});

RunCache.onKeyExpiry('user:*:profile', (event) => {
  console.log(`User profile ${event.key} expired`);
});
```

### `onRefetch(callback)`

Registers a callback for all refetch events.

**Parameters:**

- `callback`: `(event: RefetchEvent) => void` - Function to call when any entry is refreshed

**Returns:** `void`

**Example:**

```typescript
RunCache.onRefetch((event) => {
  console.log(`Cache key ${event.key} was refreshed`);
});
```

### `onKeyRefetch(key, callback)`

Registers a callback for refetch events for a specific key or pattern.

**Parameters:**

- `key`: `string` - The key or pattern to watch
- `callback`: `(event: RefetchEvent) => void` - Function to call when matching entries are refreshed

**Returns:** `void`

**Example:**

```typescript
RunCache.onKeyRefetch('weather-data', (event) => {
  console.log('Weather data was refreshed');
});
```

### `onRefetchFailure(callback)`

Registers a callback for all refetch failure events.

**Parameters:**

- `callback`: `(event: RefetchFailureEvent) => void` - Function to call when any refresh fails

**Returns:** `void`

**Example:**

```typescript
RunCache.onRefetchFailure((event) => {
  console.error(`Failed to refresh ${event.key}:`, event.error);
});
```

### `onKeyRefetchFailure(key, callback)`

Registers a callback for refetch failure events for a specific key or pattern.

**Parameters:**

- `key`: `string` - The key or pattern to watch
- `callback`: `(event: RefetchFailureEvent) => void` - Function to call when matching refreshes fail

**Returns:** `void`

**Example:**

```typescript
RunCache.onKeyRefetchFailure('api-data', (event) => {
  console.error('API data refresh failed:', event.error);
});
```

### `onTagInvalidation(callback)`

Registers a callback for all tag invalidation events.

**Parameters:**

- `callback`: `(event: TagInvalidationEvent) => void` - Function to call when any entry is invalidated by tag

**Returns:** `void`

**Example:**

```typescript
RunCache.onTagInvalidation((event) => {
  console.log(`${event.key} was invalidated by tag: ${event.tag}`);
});
```

### `onKeyTagInvalidation(key, callback)`

Registers a callback for tag invalidation events for a specific key or pattern.

**Parameters:**

- `key`: `string` - The key or pattern to watch
- `callback`: `(event: TagInvalidationEvent) => void` - Function to call when matching entries are invalidated by tag

**Returns:** `void`

**Example:**

```typescript
RunCache.onKeyTagInvalidation('user:*:profile', (event) => {
  console.log(`User profile ${event.key} was invalidated by tag: ${event.tag}`);
});
```

### `onDependencyInvalidation(callback)`

Registers a callback for all dependency invalidation events.

**Parameters:**

- `callback`: `(event: DependencyInvalidationEvent) => void` - Function to call when any entry is invalidated by dependency

**Returns:** `void`

**Example:**

```typescript
RunCache.onDependencyInvalidation((event) => {
  console.log(`${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

### `onKeyDependencyInvalidation(key, callback)`

Registers a callback for dependency invalidation events for a specific key or pattern.

**Parameters:**

- `key`: `string` - The key or pattern to watch
- `callback`: `(event: DependencyInvalidationEvent) => void` - Function to call when matching entries are invalidated by dependency

**Returns:** `void`

**Example:**

```typescript
RunCache.onKeyDependencyInvalidation('dashboard:*', (event) => {
  console.log(`Dashboard ${event.key} was invalidated due to dependency on: ${event.dependencyKey}`);
});
```

### `clearEventListeners(options?)`

Removes event listeners based on the specified options.

**Parameters:**

- `options?`: `Object` - Options to specify which listeners to remove
  - `event?`: `EVENT` - The event type to remove listeners for
  - `key?`: `string` - The key or pattern to remove listeners for
  - `handler?`: `Function` - The specific handler function to remove

**Returns:** `void`

**Example:**

```typescript
// Remove all event listeners
RunCache.clearEventListeners();

// Remove all expiry listeners
RunCache.clearEventListeners({ event: EVENT.EXPIRE });

// Remove listeners for a specific key
RunCache.clearEventListeners({ key: 'api-data' });

// Remove specific event listeners for a key
RunCache.clearEventListeners({ event: EVENT.REFETCH, key: 'api-data' });
```

## Middleware

### `use(middleware)`

Adds a middleware function to intercept and transform cache operations.

**Parameters:**

- `middleware`: `MiddlewareFunction` - The middleware function to add

**Returns:** `void`

**Example:**

```typescript
// Add a logging middleware
RunCache.use(async (value, context, next) => {
  console.log(`${context.operation} operation for key: ${context.key}`);
  return next(value);
});

// Add an encryption middleware
RunCache.use(async (value, context, next) => {
  if (context.operation === 'set' && value) {
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

**Returns:** `void`

**Example:**

```typescript
// Remove all middleware
RunCache.clearMiddleware();
```

## Storage Operations

### `setupAutoSave(interval)`

Configures automatic saving to persistent storage.

**Parameters:**

- `interval`: `number` - The interval in milliseconds between saves (0 to disable)

**Returns:** `void`

**Example:**

```typescript
// Save cache to storage every 5 minutes
RunCache.setupAutoSave(300000);

// Disable auto-saving
RunCache.setupAutoSave(0);
```

### `saveToStorage()`

Manually saves the cache state to persistent storage.

**Returns:** `Promise<void>`

**Example:**

```typescript
// Manually save cache state
await RunCache.saveToStorage();
```

### `loadFromStorage()`

Manually loads the cache state from persistent storage.

**Returns:** `Promise<void>`

**Example:**

```typescript
// Manually load cache state
await RunCache.loadFromStorage();
```

### `createTypedCache<T>()`

Creates a typed cache interface that provides type-safe operations for a specific type.

**Type Parameters:**

- `T` - The type of values that will be cached

**Returns:** `TypedCacheInterface<T>` - A typed cache interface instance

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
const user = await userCache.get('user:123'); // User | undefined
const product = await productCache.get('product:456'); // Product | undefined

// TypeScript will enforce correct types
// userCache.set({ key: 'test', value: { wrong: 'type' } }); // ❌ Type error
```

## Resource Management

### `shutdown()`

Shuts down the cache, clearing all entries, timers, and event listeners.

**Returns:** `void`

**Example:**

```typescript
// Shut down the cache
RunCache.shutdown();
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

RunCache.configure({
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

RunCache.clearEventListeners({
  event: EVENT.EXPIRE
});
```

## Type Definitions

### `CacheConfig`

Configuration options for RunCache:

```typescript
interface CacheConfig {
  maxEntries?: number;
  evictionPolicy?: EvictionPolicy;
  debug?: boolean;
  storageAdapter?: StorageAdapter;
}
```

### `ExpiryEvent`

Event object for expiry events:

```typescript
interface ExpiryEvent {
  key: string;
  ttl: number;
  updatedAt: number;
  metadata?: any;
}
```

### `RefetchEvent`

Event object for refetch events:

```typescript
interface RefetchEvent {
  key: string;
  metadata?: any;
}
```

### `RefetchFailureEvent`

Event object for refetch failure events:

```typescript
interface RefetchFailureEvent {
  key: string;
  error: Error;
  metadata?: any;
}
```

### `TagInvalidationEvent`

Event object for tag invalidation events:

```typescript
interface TagInvalidationEvent {
  key: string;
  tag: string;
  metadata?: any;
}
```

### `DependencyInvalidationEvent`

Event object for dependency invalidation events:

```typescript
interface DependencyInvalidationEvent {
  key: string;
  dependencyKey: string;
  metadata?: any;
}
```

### `MiddlewareFunction`

Type definition for middleware functions:

```typescript
type MiddlewareFunction = (
  value: string | undefined,
  context: MiddlewareContext,
  next: (value: string | undefined) => Promise<string | undefined>
) => Promise<string | undefined>;
```

### `MiddlewareContext`

Context object passed to middleware functions:

```typescript
interface MiddlewareContext {
  operation: 'get' | 'set' | 'delete' | 'refetch' | 'evict';
  key: string;
  metadata?: any;
}
```

### `StorageAdapter`

Interface for storage adapters:

```typescript
interface StorageAdapter {
  save(data: string): Promise<void>;
  load(): Promise<string | null>;
}
```

### `StorageAdapterConfig`

Configuration options for storage adapters:

```typescript
interface StorageAdapterConfig {
  storageKey?: string;
  autoSaveInterval?: number;
  autoLoadOnInit?: boolean;
  filePath?: string; // FilesystemAdapter only
}
``` 