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

## API Reference

### Cache Management

#### Setting Cache Entries

```typescript
await RunCache.set({
  key: string,                         // Required: Unique identifier for the cache entry
  value?: string,                      // Optional: String value to cache (required if no sourceFn)
  ttl?: number,                        // Optional: Time-to-live in milliseconds
  autoRefetch?: boolean,               // Optional: Automatically refetch on expiry (requires ttl and sourceFn)
  sourceFn?: () => string | Promise<string> // Optional: Function to generate cache value (required if no value)
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

#### Checking Cache Status

```typescript
// Check if a valid (non-expired) cache entry exists
const exists = await RunCache.has("cache-key");

// Check if any matching cache entries exist
const hasItems = await RunCache.has("session-*");
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

## License

This project is licensed under the MIT License - see the LICENSE file for details.
