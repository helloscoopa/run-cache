# Middleware

The middleware system in RunCache allows you to intercept and transform cache operations. This enables powerful customization options such as:

- Value validation
- Value normalization/transformation
- Encryption/decryption of cached values
- Logging or monitoring specific cache operations
- Custom business logic based on cache operations

## Basic Usage

Middleware functions are added to the RunCache using the `use()` method:

```javascript
import { RunCache } from 'run-cache';

// Add a simple middleware that logs all cache operations
RunCache.use(async (value, context, next) => {
  console.log(`Cache operation: ${context.operation} for key: ${context.key}`);
  return next(value);
});
```

## Middleware Function Signature

Middleware functions have the following signature:

```typescript
(value: string | undefined, context: MiddlewareContext, next: (value: string | undefined) => Promise<string | undefined>) => Promise<string | undefined>
```

Where:

- `value`: The current value being processed
- `context`: Object containing metadata about the operation
- `next`: Function to call the next middleware in the chain

The context object contains:

```typescript
interface MiddlewareContext {
  key: string;                 // The cache key being operated on
  operation: 'get' | 'set' | 'delete' | 'has' | 'refetch'; // The operation being performed
  value?: string;              // The original value (if applicable)
  ttl?: number;                // Time-to-live in milliseconds (if applicable)
  autoRefetch?: boolean;       // Whether auto-refetch is enabled (if applicable)
  timestamp: number;           // Timestamp when the operation was initiated
}
```

## Examples

### Encryption Middleware

```javascript
import { RunCache } from 'run-cache';
import { encrypt, decrypt } from './your-crypto-lib';

// Add encryption middleware
RunCache.use(async (value, context, next) => {
  if (context.operation === 'set' && value) {
    // Encrypt the value before storing
    return next(encrypt(value));
  } else if (context.operation === 'get' || context.operation === 'refetch') {
    // Decrypt the value after retrieval
    const encrypted = await next(value);
    return encrypted ? decrypt(encrypted) : undefined;
  }
  return next(value);
});

// Use the cache normally - values will be automatically encrypted/decrypted
await RunCache.set({ key: 'sensitive-data', value: 'secret-value' });
const value = await RunCache.get('sensitive-data'); // Returns decrypted 'secret-value'
```

### Data Validation Middleware

```javascript
import { RunCache } from 'run-cache';

// Add validation middleware
RunCache.use(async (value, context, next) => {
  if (context.operation === 'set') {
    if (!value || value.length < 3) {
      // Reject invalid values
      throw new Error(`Invalid value for key ${context.key}: minimum length is 3 characters`);
    }
  }
  return next(value);
});

// Valid value - passes through middleware
await RunCache.set({ key: 'valid-key', value: 'valid-value' });

// Invalid value - throws error
try {
  await RunCache.set({ key: 'invalid-key', value: 'a' });
} catch (error) {
  console.error(error.message); // "Invalid value for key invalid-key: minimum length is 3 characters"
}
```

### JSON Serialization Middleware

```javascript
import { RunCache } from 'run-cache';

// Add JSON serialization middleware
RunCache.use(async (value, context, next) => {
  if (context.operation === 'set' && value && typeof value === 'object') {
    // Serialize objects to JSON strings
    return next(JSON.stringify(value));
  } else if ((context.operation === 'get' || context.operation === 'refetch') && value) {
    const result = await next(value);
    if (result) {
      try {
        // Try to parse the result as JSON
        return JSON.parse(result);
      } catch (e) {
        // If parsing fails, return the raw string
        return result;
      }
    }
    return result;
  }
  return next(value);
});

// Store complex objects directly
await RunCache.set({ 
  key: 'user', 
  value: { id: 123, name: 'John Doe', email: 'john@example.com' } 
});

// Retrieve the object
const user = await RunCache.get('user'); // Returns the parsed object: { id: 123, name: 'John Doe', ... }
```

## Chaining Multiple Middleware

Middleware functions are executed in the order they are added. Each middleware can transform the value before passing it to the next middleware:

```javascript
// First middleware compresses the data
RunCache.use(async (value, context, next) => {
  if (context.operation === 'set' && value) {
    return next(compress(value));
  } else if (context.operation === 'get') {
    const compressed = await next(value);
    return compressed ? decompress(compressed) : undefined;
  }
  return next(value);
});

// Second middleware encrypts the data
RunCache.use(async (value, context, next) => {
  if (context.operation === 'set' && value) {
    return next(encrypt(value));
  } else if (context.operation === 'get') {
    const encrypted = await next(value);
    return encrypted ? decrypt(encrypted) : undefined;
  }
  return next(value);
});
```

In this example, when setting a value:
1. The value is first compressed by the first middleware
2. The compressed value is then encrypted by the second middleware
3. The encrypted and compressed value is stored in the cache

When getting a value:
1. The encrypted and compressed value is retrieved from the cache
2. The second middleware decrypts it
3. The first middleware decompresses it
4. The original value is returned to the caller

## Clearing Middleware

To remove all middleware functions:

```javascript
RunCache.clearMiddleware();
```

## Best Practices

1. **Keep middleware functions focused**: Each middleware should have a single responsibility.
2. **Handle all operations**: Make sure to handle all relevant operations (get, set, refetch) for consistency.
3. **Always call next()**: Ensure you call `next(value)` to continue the middleware chain, unless you explicitly want to short-circuit it.
4. **Error handling**: Properly handle errors in your middleware to avoid breaking the cache functionality.
5. **Performance**: Be mindful of performance implications, especially for computationally expensive operations like encryption.

## Next Steps

- Learn about [Event System](event-system.md) for responding to cache events
- Explore [Persistent Storage](persistent-storage.md) for saving cache data across application restarts
- Check out [Resource Management](resource-management.md) for optimizing memory usage 