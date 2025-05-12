# Quick Start

This guide will help you get started with RunCache quickly. For more detailed explanations, see the [Basic Usage](./basic-usage.md) guide.

## Installation

```bash
npm install run-cache
```

## Basic Setup

First, import the RunCache library in your project:

```typescript
import { RunCache } from 'run-cache';
```

### Simple Caching Example

```typescript
// Set a simple string value
await RunCache.set({ key: 'greeting', value: 'Hello, World!' });

// Retrieve the value
const greeting = await RunCache.get('greeting');
console.log(greeting); // Output: Hello, World!

// Cache a JSON object
const user = { id: 1, name: 'John Doe' };
await RunCache.set({ key: 'user:1', value: JSON.stringify(user) });

// Retrieve and parse the JSON
const userJson = await RunCache.get('user:1');
const retrievedUser = JSON.parse(userJson);
```

### Caching with TTL (Expiration)

```typescript
// Cache with 5-minute expiration
await RunCache.set({ 
  key: 'temporary-data', 
  value: 'This will expire soon',
  ttl: 5 * 60 * 1000 // 5 minutes
});
```

### Using Source Functions

```typescript
// Cache with a source function
await RunCache.set({
  key: 'user:2',
  sourceFn: async () => {
    // Simulate API call
    return JSON.stringify({ id: 2, name: 'Jane Doe' });
  }
});
```

### Automatic Refetching

```typescript
// Set up automatic background refreshing
await RunCache.set({
  key: 'stock-price',
  sourceFn: async () => {
    // Simulate API call
    return JSON.stringify({ price: Math.random() * 100 });
  },
  ttl: 60000, // 1 minute
  autoRefetch: true
});
```

### Basic Cache Operations

```typescript
// Check if a key exists
const exists = await RunCache.has('user:1');

// Delete a cache entry
RunCache.delete('temporary-data');

// Clear the entire cache
RunCache.flush();
```

### Simple Configuration

```typescript
import { RunCache, EvictionPolicy } from 'run-cache';

// Configure cache settings
RunCache.configure({
  maxSize: 1000,
  evictionPolicy: EvictionPolicy.LRU
});
```

## Next Steps

Now that you've seen the basics of RunCache, check out these guides:

- [Basic Usage](./basic-usage.md) - Detailed explanation of fundamental operations
- [Cache Management](../features/cache-management.md) - Learn more about managing cache entries
- [TTL and Expiration](../features/ttl-expiration.md) - Understand time-to-live functionality
- [Eviction Policies](../features/eviction-policies.md) - Configure how cache entries are evicted 