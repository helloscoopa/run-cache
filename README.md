[![npm](https://img.shields.io/npm/v/run-cache?colorA=000000&colorB=ff98a2)](https://www.npmjs.com/package/run-cache)

# RunCache

RunCache is a dependency nil, light-weight in-memory caching library for JavaScript and TypeScript that allows you to cache `string` values with optional time-to-live (TTL) settings. It also supports caching values generated from asynchronous functions and provides methods to refetch them on demand.

## Features

- **In-memory caching** with optional TTL (time-to-live).
- **Asynchronous source functions** for fetching and caching dynamic data.
- **Refetch functionality** to update cache values using stored source functions.
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

#### Set cache:

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

await RunCache.set({
  key: "Key",
  ttl: 10000,
  onExpiry: async (cache: EventParam) => {
    console.log(`Cache of key '${cache.key}' has been expired`);
  }
})

await RunCache.set({
  key: "Key",
  ttl: 10000,
  sourceFn: () => { return Promise.resolve("Value") }
  onRefetch: async (cache: EventParam) => {
    console.log(`Cache of key '${cache.key}' has been refetched`);
  }
})
```

#### Refetch cache:

```ts
// Refetch the cache value (Only works if the key is set with a sourceFn)
await RunCache.refetch("Key");
```

#### Get cache:

```ts
/* 
  Get a value for a given cache key, will refetch value automatically
  if `sourceFn` is provided and `autoRefetch: true` 
*/
const value = await RunCache.get("Key");
```

#### Delete cache:

```ts
// Delete a specific cache key
RunCache.delete("Key");

// Delete all cache keys
RunCache.deleteAll();
```

#### Check existence of a specific cache:

```ts
// Returns a boolean, expired cache returns `false` even if they're refetchable
const hasCache = RunCache.has("Key");
```
