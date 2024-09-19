[![npm-version](https://img.shields.io/npm/v/run-cache)](https://www.npmjs.com/package/run-cache)
[![license](https://img.shields.io/github/license/helloscoopa/run-cache)](https://github.com/helloscoopa/run-cache?tab=MIT-1-ov-file)
[![ci-build](https://img.shields.io/github/actions/workflow/status/helloscoopa/run-cache/build.yml?label=build)](https://github.com/helloscoopa/run-cache/actions/workflows/build.yml)
[![ci-tests](https://img.shields.io/github/actions/workflow/status/helloscoopa/run-cache/tests.yml?label=tests)](https://github.com/helloscoopa/run-cache/actions/workflows/tests.yml)
[![commits-since](https://img.shields.io/github/commits-since/helloscoopa/run-cache/latest/main?color=yellow)](https://github.com/helloscoopa/run-cache/releases/latest)

# Run~time~Cache

RunCache is a dependency-free, lightweight runtime caching library for JavaScript and TypeScript that allows you to cache `string` values with optional time-to-live (TTL) settings. It also supports caching values generated from asynchronous functions and provides methods to refetch them on demand.

## Features

- **In-memory caching** with optional TTL (time-to-live).
- **Asynchronous source functions** for fetching and caching dynamic data.
- **Refetch functionality** to update cache values using stored source functions.
- **Events** to get know when cache expires or being refetched.
- **Easy interface** for managing cached data: set, get, delete and check existence.

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
  Use a callback function to get know when your cache expires
  or when its being refetched. The expiry is triggered only
  on demand, not automatically.
*/
import { EventParam } from "run-cache";

// Event of all expiries
RunCache.onExpiry((cache: EventParam) => {
  console.log(`Cache of key '${cache.key}' has been expired`);
})

// Event of a specific key expiry
RunCache.onExpiry('Key', (cache: EventParam) => {
  console.log(`Cache of key '${cache.key}' has been expired`);
})

await RunCache.set({
  key: "Key",
  ttl: 10000
})

// Event of all refetches
RunCache.onRefetch((cache: EventParam) => {
  console.log(`Cache of key '${cache.key}' has been refetched`);
})

// Event of a specific key refetch
RunCache.onKeyRefetch('Key', (cache: EventParam) => {
  console.log(`Cache of key '${cache.key}' has been refetched`);
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
```

#### Get cache

```ts
/* 
  Get a value for a given cache key, will refetch value automatically
  if `sourceFn` is provided and `autoRefetch: true` 
*/
const value = await RunCache.get("Key");
```

#### Delete cache

```ts
// Delete a specific cache key
RunCache.delete("Key");

// Delete all cache keys
RunCache.deleteAll();
```

#### Check existence of a specific cache

```ts
// Returns a boolean, expired cache returns `false` even if they're refetchable
const hasCache = RunCache.has("Key");
```

#### Clear event listeners

```ts
await RunCache.set({
  key: "Key",
  ttl: 10000,
  sourceFn: () => {
    return Promise.resolve("Value");
  },
});

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
```
