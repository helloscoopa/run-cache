[![npm-version](https://img.shields.io/npm/v/run-cache)](https://www.npmjs.com/package/run-cache)
[![license](https://img.shields.io/github/license/helloscoopa/run-cache)](https://github.com/helloscoopa/run-cache?tab=MIT-1-ov-file)
[![ci-build](https://img.shields.io/github/actions/workflow/status/helloscoopa/run-cache/build.yml?label=build)](https://github.com/helloscoopa/run-cache/actions/workflows/build.yml)
[![ci-tests](https://img.shields.io/github/actions/workflow/status/helloscoopa/run-cache/tests.yml?label=tests)](https://github.com/helloscoopa/run-cache/actions/workflows/tests.yml)

# Run~time~Cache

RunCache is a dependency-free, lightweight runtime caching library for JavaScript and TypeScript that allows you to cache `string` values with optional time-to-live (TTL) settings. It also supports caching values generated from sync/async functions and provide methods to refetch them on expiry or on demand; with a set of events to keep track of the state of the cache.

## Features

- **Dependency-free:** Does not consume any external dependencies.
- **In-memory caching:** A runtime cache that gives you quick access.
- **Sync/async source functions:** Fetch dynamic data from user-defined functions.
- **Events:** Get to know when cache expires, refetched or refetch fails.
- **Intuitive SDK:** Clean interface to access data.
- **Wildcard key patterns:** Use pattern matching to operate on multiple related keys.

## Installation

To use `RunCache`, simply install it via npm:

```bash
npm install run-cache
```

## Usage

#### Import library

```ts
import { RunCache } from "run-cache";
```

#### Set cache

```ts
// Set a cache value
await RunCache.set({
  key: "Key",
  value: "Value",
});

// Set a cache value with 60s ttl
await RunCache.set({
  key: "Key",
  value: "Value",
  ttl: 60000 // in milliseconds
});

// Set a cache value with function to fetch the value later
await RunCache.set({
  key: "Key",
  sourceFn: () => { return Promise.resolve("Value") }
});

/*
  Additionally, set autoRefetch: true along with a ttl value
  to enable automatic refetching. This will cause the cache
  to refetch the value upon expiry whenever the consumer
  calls `get` on the specified key.
*/
await RunCache.set({
  key: "Key",
  sourceFn: () => { return Promise.resolve("Value") }
  autoRefetch: true,
  ttl: 10000,
});

/*
  Use a callback function to get to know when your cache expires
  or when its being refetched. The expiry is triggered only
  on demand, not automatically.
*/
import { EventParam } from "run-cache";

// Event of all expiries
RunCache.onExpiry((cache: EventParam) => {
  console.log(`Cache of key '${cache.key}' has been expired`);
})

// Event of a specific key expiry
RunCache.onKeyExpiry('Key', (cache: EventParam) => {
  console.log(`Specific key has been expired`);
})

// Event for keys matching a pattern
RunCache.onKeyExpiry('user-*', (cache: EventParam) => {
  console.log(`User cache key '${cache.key}' has expired`);
})

await RunCache.set({
  key: "Key",
  ttl: 10000
})

// Event of any key refetches
RunCache.onRefetch((cache: EventParam) => {
  console.log(`Cache of key '${cache.key}' has been refetched`);
})

// Event of a specific key refetch
RunCache.onKeyRefetch('Key', (cache: EventParam) => {
  console.log(`Specific key has been refetched`);
})

// Event for keys matching a pattern
RunCache.onKeyRefetch('user-*', (cache: EventParam) => {
  console.log(`User cache key '${cache.key}' has been refetched`);
})

// Event of a key refetch failure
RunCache.onRefetchFailure((cache: EventParam) => {
  console.log(`Cache of key '${cache.key}' has been refetched`);
})

// Event of a specific key refetch failure
RunCache.onKeyRefetchFailure('Key', (cache: EventParam) => {
  console.log(`Specific key has been failed to refetch`);
})

// Event for keys matching a pattern
RunCache.onKeyRefetchFailure('user-*', (cache: EventParam) => {
  console.log(`User cache key '${cache.key}' failed to refetch`);
})

await RunCache.set({
  key: "Key",
  ttl: 10000,
  sourceFn: () => { return Promise.resolve("Value") }
})
```

#### Refetch cache

```ts
// Refetch the cache value (Only works if the key is set with a sourceFn)
await RunCache.refetch("Key");

// Refetch all cache values matching the pattern
await RunCache.refetch("user-*");
```

#### Get cache

```ts
/* 
  Get a value for a given cache key, will refetch value automatically
  if `sourceFn` is provided and `autoRefetch: true` 
*/
const value = await RunCache.get("Key");

// Get all values for keys matching a pattern (returns array of values)
const userValues = await RunCache.get("user-*");
```

#### Delete cache

```ts
// Delete a specific cache key
RunCache.delete("Key");

// Delete all keys matching a pattern
RunCache.delete("user-*");

// Delete all cache keys
RunCache.flush();
```

#### Check the existence of a specific cache

```ts
// Returns a boolean, expired cache returns `false` even if they're refetchable
const hasCache = await RunCache.has("Key");

// Check if any keys matching the pattern exist
const hasUserCache = await RunCache.has("user-*");
```

#### Clear event listeners

```ts
// Clear all listeners
RunCache.clearEventListeners();

// Clear specific event listeners
RunCache.clearEventListeners({
  event: "expiry",
});

// Clear specific event key listeners
RunCache.clearEventListeners({
  event: "expiry",
  key: "Key",
});

// Clear event listeners for keys matching a pattern
RunCache.clearEventListeners({
  event: "expiry",
  key: "user-*",
});
```

## Wildcards

RunCache supports wildcard pattern matching for keys. You can use the `*` character as a wildcard in your key patterns to operate on multiple related keys at once.

### Examples

```ts
// Set multiple user-related cache entries
await RunCache.set({ key: "user-1", value: "Alice" });
await RunCache.set({ key: "user-2", value: "Bob" });
await RunCache.set({ key: "user-3", value: "Charlie" });

// Get all user values as an array
const users = await RunCache.get("user-*");
// Result: ["Alice", "Bob", "Charlie"]

// Delete all user entries
RunCache.delete("user-*");

// Get event notifications for all user keys
RunCache.onKeyExpiry("user-*", (cache) => {
  console.log(`User cache ${cache.key} expired`);
});

// Clear all event listeners for user keys
RunCache.clearEventListeners({
  event: "expiry",
  key: "user-*"
});
```

Wildcard support is available for the following operations:
- `get`: Returns an array of values for all matching keys
- `delete`: Deletes all matching keys
- `refetch`: Refetches all matching keys with source functions
- `has`: Returns true if any matching key exists
- Event listeners: Register callbacks for keys matching patterns
- `clearEventListeners`: Clear listeners for keys matching patterns
