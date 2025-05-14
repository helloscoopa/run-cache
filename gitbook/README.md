# RunCache

> A dependency-free, lightweight runtime caching library for JavaScript and TypeScript applications.

[![npm-version](https://img.shields.io/npm/v/run-cache)](https://www.npmjs.com/package/run-cache)
[![license](https://img.shields.io/github/license/helloscoopa/run-cache)](https://github.com/helloscoopa/run-cache?tab=MIT-1-ov-file)
[![ci-build](https://img.shields.io/github/actions/workflow/status/helloscoopa/run-cache/build.yml?label=build)](https://github.com/helloscoopa/run-cache/actions/workflows/build.yml)
[![ci-tests](https://img.shields.io/github/actions/workflow/status/helloscoopa/run-cache/tests.yml?label=tests)](https://github.com/helloscoopa/run-cache/actions/workflows/tests.yml)

RunCache allows you to cache string values with configurable time-to-live (TTL) settings and supports automatic value regeneration through source functions. It's designed to be easy to use while providing powerful features for advanced caching scenarios.

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
- **Persistent Storage:** Store cache data across application restarts using various storage adapters
- **TypeScript Support:** Full type definitions included

## Quick Example

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
```

## When to Use RunCache

RunCache is ideal for:

- Caching API responses to reduce network requests
- Storing computed values to improve application performance
- Managing temporary data with automatic expiration
- Creating relationships between cached data with dependencies
- Implementing complex caching strategies with middleware

## Getting Started

To get started with RunCache, check out the [Installation](getting-started/installation.md) guide. 