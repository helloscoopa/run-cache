# RunCache

`RunCache` is a dependency nil, light-weight in-memory caching library for JavaScript and TypeScript that allows you to cache `string` values with optional time-to-live (TTL) settings. It also supports caching values generated from asynchronous functions and provides methods for refetching and managing cached data.

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

```js
import { RunCache } from "run-cache";

// Set a cache value with 60s ttl
RunCache.set("sample_key_1", "sample_value_1", 60000);

// Set a cache value with function definition to fetch the value later
RunCache.setWithSourceFn("sample_key_2", () => {
  return Promise.resolve("sample_value_2");
});

// Refetch the cache value (This will call the above function and update the cache value)
await RunCache.refetch("sample_key_2");

// Get a value for a given cache key
const value = RunCache.get("sample_key_1");

// Delete a specific cache key
RunCache.delete("sample_key_1");

// Delete all cache keys
RunCache.deleteAll();

// Returns a boolean based on existence of the given cache key
const hasCache = RunCache.has("sample_key_1");
```
