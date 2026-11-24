# Debugging and Logging

This guide provides techniques and strategies for debugging issues in RunCache and implementing effective logging. By following these recommendations, you can identify and resolve problems more quickly and gain better visibility into cache operations.

## Built-in Logging

RunCache includes built-in logging capabilities through its debug mode.

### Enabling debug Mode

To enable debug logging:

```typescript
import { RunCache } from 'run-cache';

// Enable debug logging
await RunCache.configure({
  debug: true
});
```

When debug mode is enabled, RunCache logs detailed information about:
- Cache operations (set, get, delete, etc.)
- Entry expiration and eviction
- Refetch operations and failures
- Configuration changes

All logs include timestamps and operation details. Nothing is logged, not even errors, while debug mode is off.

### Disabling debug Mode

To disable debug logging when you're done debugging:

```typescript
// Disable debug logging
await RunCache.configure({
  debug: false
});
```

## Custom Logging with Middleware

You can implement more detailed custom logging using middleware.

### Basic Logging Middleware

```typescript
import { RunCache } from 'run-cache';

// Add logging middleware
await RunCache.use(async (value, context, next) => {
  console.log(`[RunCache] ${context.operation.toUpperCase()} operation for key: ${context.key}`);

  try {
    const result = await next(value);
    console.log(`[RunCache] ${context.operation.toUpperCase()} completed for key: ${context.key}`);
    return result;
  } catch (error) {
    console.error(`[RunCache] ${context.operation.toUpperCase()} failed for key: ${context.key}:`, error);
    throw error;
  }
});
```

### Advanced Logging Middleware

For more advanced logging with performance metrics:

```typescript
await RunCache.use(async (value, context, next) => {
  const start = performance.now();
  const operation = context.operation.toUpperCase();

  console.log(`[RunCache] START ${operation} - Key: ${context.key}`);

  try {
    const result = await next(value);

    const duration = performance.now() - start;
    console.log(
      `[RunCache] END ${operation} - Key: ${context.key}, Duration: ${duration.toFixed(2)}ms, ` +
      `Result: ${result ? 'success' : 'empty'}`
    );

    return result;
  } catch (error) {
    const duration = performance.now() - start;
    console.error(
      `[RunCache] ERROR ${operation} - Key: ${context.key}, Duration: ${duration.toFixed(2)}ms, ` +
      `Error: ${error.message}`
    );

    throw error;
  }
});
```

### Logging to External Services

You can integrate with external logging services:

```typescript
// Example with Winston logger
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'run-cache' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Add winston logging middleware
await RunCache.use(async (value, context, next) => {
  logger.info({
    message: 'Cache operation started',
    operation: context.operation,
    key: context.key
  });

  try {
    const result = await next(value);

    logger.info({
      message: 'Cache operation completed',
      operation: context.operation,
      key: context.key,
      success: !!result
    });

    return result;
  } catch (error) {
    logger.error({
      message: 'Cache operation failed',
      operation: context.operation,
      key: context.key,
      error: error.message,
      stack: error.stack
    });

    throw error;
  }
});
```

## Monitoring Cache Events

The event system provides another way to debug and monitor cache operations.

### Basic Event Monitoring

```typescript
import { RunCache, EVENT } from 'run-cache';

// Monitor expiry events
await RunCache.onExpiry((event) => {
  console.log(`[RunCache] Key expired: ${event.key}, TTL: ${event.ttl}ms`);
});

// Monitor refetch events
await RunCache.onRefetch((event) => {
  console.log(`[RunCache] Key refreshed: ${event.key}`);
});

// Monitor refetch failures
await RunCache.onRefetchFailure((event) => {
  console.error(`[RunCache] Refresh failed for key: ${event.key}`, event.error);
});

// Monitor tag invalidations
await RunCache.onTagInvalidation((event) => {
  console.log(`[RunCache] Key invalidated by tag: ${event.key}, Tag: ${event.tag}`);
});

// Monitor dependency invalidations
await RunCache.onDependencyInvalidation((event) => {
  console.log(`[RunCache] Key invalidated by dependency: ${event.key}, Dependency: ${event.dependencyKey}`);
});
```

Event payloads contain `key`, `value` (the stored string), `ttl`, `createdAt` and `updatedAt`, plus `tag` or `dependencyKey` for invalidation events. Refetch failure events also have `error`, set to what the source function threw. A manual `refetch()` additionally rejects with a `SourceFnError` whose `cause` is that error.

### Monitoring Specific Keys

For debugging issues with specific keys:

```typescript
// Monitor operations on a specific key
await RunCache.onKeyExpiry('important-data', (event) => {
  console.log(`[RunCache] Important data expired at ${new Date().toISOString()}`);
});

await RunCache.onKeyRefetch('important-data', (event) => {
  console.log(`[RunCache] Important data refreshed at ${new Date().toISOString()}`);
});

await RunCache.onKeyRefetchFailure('important-data', (event) => {
  console.error(`[RunCache] Important data refresh failed: ${event.key}`);
});
```

### Using Patterns for Grouped Monitoring

You can use patterns to monitor groups of related keys:

```typescript
// Monitor all user-related expirations
await RunCache.onKeyExpiry('user:*', (event) => {
  console.log(`[RunCache] User data expired: ${event.key}`);
});

// Monitor all API-related refresh failures
await RunCache.onKeyRefetchFailure('api:*', (event) => {
  console.error(`[RunCache] API data refresh failed: ${event.key}`, event.error);
});
```

## Debugging Common Issues

### Diagnosing Cache Misses

Middleware only runs for `get` on a hit, so it cannot see misses. `debug: true` logs every read with the reason:

```typescript
await RunCache.configure({ debug: true });

await RunCache.get('user:1');
// RunCache [2026-01-01T00:00:00.000Z] [DEBUG]: Cache miss for key: user:1   (never set, deleted or evicted)
// RunCache [...] [DEBUG]: Cache expired for key: user:1                       (TTL passed)
// RunCache [...] [DEBUG]: Removing expired entry for key: user:1
```

To count or log misses in your own code, wrap `get()`:

```typescript
async function getWithMissLog<T>(key: string) {
  const value = await RunCache.get<T>(key);
  if (value === undefined) {
    console.log(`[RunCache] Cache miss for key: ${key}`);
  }
  return value;
}
```

Common causes of unexpected misses:

- The TTL is in seconds instead of milliseconds.
- `maxEntries` is set and the entry was evicted.
- The entry was removed by `invalidateByTag()`, or because an entry it depends on was updated, refetched, deleted, evicted or expired; listen with `onTagInvalidation`/`onDependencyInvalidation` to confirm.
- The process restarted and the entry was not saved before exit (see [Persistent Storage](../advanced/persistent-storage.md)).

### Debugging TTL Issues

If entries are expiring too soon or not expiring when expected:

```typescript
// Add TTL debugging middleware
await RunCache.use(async (value, context, next) => {
  if (context.operation === 'set' && context.ttl) {
    console.log(
      `[RunCache] Setting key ${context.key} with TTL ${context.ttl}ms, ` +
      `will expire at ${new Date(Date.now() + context.ttl).toISOString()}`
    );
  }
  return next(value);
});

// Monitor all expiry events
await RunCache.onExpiry((event) => {
  console.log(
    `[RunCache] Key ${event.key} expired. ` +
    `TTL was ${event.ttl}ms. ` +
    `Last updated at ${new Date(event.updatedAt).toISOString()}, ` +
    `expired at ${new Date(event.updatedAt + event.ttl).toISOString()}`
  );
});
```

### Debugging Automatic Refetching

`set()` throws when `autoRefetch` is given without a `ttl`. Without a `sourceFn`, `autoRefetch` has no effect and the entry is simply removed when it expires. Entries restored from a storage adapter have no `sourceFn`, so they are not refetched until you `set()` them again with one.

Auto-refetch runs when the TTL timer fires, or when a read finds the entry expired first; in the second case the read returns the stale value while the refetch runs.

```typescript
// Monitor refetch events and failures
await RunCache.onRefetch((event) => {
  console.log(`[RunCache] Auto-refetch successful for key: ${event.key}`);
});

await RunCache.onRefetchFailure((event) => {
  console.error(`[RunCache] Auto-refetch failed for key: ${event.key}:`, event.error);
});
```

### Debugging Source Functions

To debug issues with source functions:

```typescript
// Create a debuggable source function wrapper
function debugSourceFn(key, fn) {
  return async () => {
    console.log(`[RunCache] Executing source function for key: ${key}`);
    const start = performance.now();

    try {
      const result = await fn();
      const duration = performance.now() - start;
      console.log(
        `[RunCache] Source function for key ${key} completed in ${duration.toFixed(2)}ms. ` +
        `Result: ${typeof result}`
      );
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      console.error(
        `[RunCache] Source function for key ${key} failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  };
}

// Usage
await RunCache.set({
  key: 'data',
  sourceFn: debugSourceFn('data', async () => {
    const response = await fetch('https://api.example.com/data');
    return response.json();
  }),
  ttl: 60000,
  autoRefetch: true
});
```

### Debugging Storage Adapters

With `debug: true`, RunCache logs each save (with its size) and load, and any adapter errors. `saveToStorage()` and `loadFromStorage()` return `false` instead of throwing when the adapter fails. For more detail, wrap the adapter:

```typescript
import { RunCache, FilesystemAdapter, type StorageAdapter } from 'run-cache';

function withLogging(adapter: StorageAdapter): StorageAdapter {
  return {
    async save(data) {
      console.log(`[RunCache] Saving ${data.length} bytes to storage`);
      await adapter.save(data);
    },
    async load() {
      const data = await adapter.load();
      console.log(`[RunCache] Loaded ${data ? data.length : 0} bytes from storage`);
      return data;
    },
    clear: () => adapter.clear()
  };
}

await RunCache.configure({
  storageAdapter: withLogging(new FilesystemAdapter({ storageKey: 'my-app-cache' }))
});
```

## Implementing Comprehensive Logging

For production environments, you might want to implement comprehensive logging:

### Creating a Logger Service

```typescript
// logger.js
class CacheLogger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.transports = options.transports || [console];
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.level];
  }

  log(level, message, data = {}) {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const logObj = {
      timestamp,
      level,
      message,
      ...data
    };

    for (const transport of this.transports) {
      if (typeof transport[level] === 'function') {
        transport[level](message, logObj);
      } else {
        transport.log(message, logObj);
      }
    }
  }

  error(message, data) { this.log('error', message, data); }
  warn(message, data) { this.log('warn', message, data); }
  info(message, data) { this.log('info', message, data); }
  debug(message, data) { this.log('debug', message, data); }
  trace(message, data) { this.log('trace', message, data); }
}

export const logger = new CacheLogger({ level: process.env.LOG_LEVEL || 'info' });
```

### Integrating with RunCache

```typescript
// cache-setup.js
import { RunCache } from 'run-cache';
import { logger } from './logger';

export async function setupCacheLogging() {
  // Add logging middleware (runs on set, refetch and get hits)
  await RunCache.use(async (value, context, next) => {
    logger.debug(`Operation ${context.operation} started for key: ${context.key}`, {
      operation: context.operation,
      key: context.key
    });

    try {
      const result = await next(value);
      logger.debug(`Operation ${context.operation} completed for key: ${context.key}`, {
        operation: context.operation,
        key: context.key,
        success: !!result
      });
      return result;
    } catch (error) {
      logger.error(`Operation ${context.operation} failed for key: ${context.key}`, {
        operation: context.operation,
        key: context.key,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  });

  // Set up event logging
  await RunCache.onExpiry((event) => {
    logger.debug(`Key expired: ${event.key}`, {
      event: 'expire',
      key: event.key,
      ttl: event.ttl,
      updatedAt: event.updatedAt
    });
  });

  await RunCache.onRefetch((event) => {
    logger.debug(`Key refreshed: ${event.key}`, {
      event: 'refetch',
      key: event.key
    });
  });

  await RunCache.onRefetchFailure((event) => {
    logger.error(`Refresh failed for key: ${event.key}`, {
      event: 'refetch_failure',
      key: event.key,
      error: event.error
    });
  });

  await RunCache.onTagInvalidation((event) => {
    logger.debug(`Key invalidated by tag: ${event.key}`, {
      event: 'tag_invalidation',
      key: event.key,
      tag: event.tag
    });
  });

  await RunCache.onDependencyInvalidation((event) => {
    logger.debug(`Key invalidated by dependency: ${event.key}`, {
      event: 'dependency_invalidation',
      key: event.key,
      dependencyKey: event.dependencyKey
    });
  });
}
```

## Debugging in Different Environments

### Browser Debugging

For browser environments:

```typescript
// Enable detailed console output
await RunCache.configure({ debug: true });

// Use browser dev tools
// 1. Set breakpoints in source functions
// 2. Monitor network requests for fetch operations
// 3. Use console.trace() to see call stacks
// 4. Watch for errors in the console

// Add a global debug function
window.__debugRunCache = async function(pattern = '*') {
  return {
    entries: await RunCache.get(pattern),
    config: await RunCache.getConfig(),
    // Add any other debug info you need
  };
};

// In browser console, you can now run:
// > await window.__debugRunCache('user:*')
```

### Node.js Debugging

For Node.js environments:

```typescript
// Enable inspector
// Start Node with: node --inspect your-script.js

// Add debug endpoints to Express app
app.get('/debug/cache', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).send('Not available in production');
  }

  const pattern = req.query.pattern || '*';
  const entries = await RunCache.get(pattern);
  const config = await RunCache.getConfig();

  res.json({
    pattern,
    entries,
    config,
    memory: process.memoryUsage()
  });
});
```

## Debugging Tools and Utilities

### Cache Inspector Utility

RunCache has no public API for listing keys or reading entry metadata. `get()` with a pattern returns the matching values (not their keys), and `has()` tells you whether a pattern matches anything:

```typescript
// cache-inspector.js
export class CacheInspector {
  static async getValues(pattern = '*') {
    const values = await RunCache.get(pattern);
    if (values === undefined) return [];
    return Array.isArray(values) ? values : [values];
  }

  static async countMatching(pattern = '*') {
    return (await this.getValues(pattern)).length;
  }

  static async approximateSize(pattern = '*') {
    const values = await this.getValues(pattern);
    return values.reduce((size, value) => size + JSON.stringify(value).length, 0);
  }
}
```

If you need key-level detail, keep your own registry of the keys you set, or use the `debug` log output.

### Performance Monitoring Utility

Middleware sees `set`, `refetch` and `get` hits, so a miss count has to come from wrapping `get()`:

```typescript
// cache-performance.js
export class CachePerformanceMonitor {
  constructor() {
    this.resetMetrics();
  }

  async start() {
    // Timing for operations that reach the middleware chain
    await RunCache.use(async (value, context, next) => {
      const start = performance.now();
      const result = await next(value);
      const op = this.metrics.operations[context.operation];
      if (op) {
        op.count++;
        op.totalTime += performance.now() - start;
      }
      return result;
    });

    // Track events
    await RunCache.onExpiry(() => { this.metrics.events.expire++; });
    await RunCache.onRefetch(() => { this.metrics.events.refetch++; });
    await RunCache.onRefetchFailure(() => { this.metrics.events.refetch_failure++; });
    await RunCache.onTagInvalidation(() => { this.metrics.events.tag_invalidation++; });
    await RunCache.onDependencyInvalidation(() => { this.metrics.events.dependency_invalidation++; });
  }

  // Use this in place of RunCache.get() to count hits and misses
  async get(key) {
    const value = await RunCache.get(key);
    if (value === undefined) this.metrics.misses++;
    else this.metrics.hits++;
    return value;
  }

  getMetrics() {
    const { hits, misses, operations, events } = this.metrics;
    return {
      hits,
      misses,
      hitRatio: hits + misses ? hits / (hits + misses) : 0,
      events: { ...events },
      operations: Object.fromEntries(
        Object.entries(operations).map(([name, op]) => [
          name,
          { ...op, avgTime: op.count ? op.totalTime / op.count : 0 }
        ])
      )
    };
  }

  resetMetrics() {
    this.metrics = {
      hits: 0,
      misses: 0,
      operations: {
        get: { count: 0, totalTime: 0 },
        set: { count: 0, totalTime: 0 },
        refetch: { count: 0, totalTime: 0 }
      },
      events: {
        expire: 0,
        refetch: 0,
        refetch_failure: 0,
        tag_invalidation: 0,
        dependency_invalidation: 0
      }
    };
  }
}

// Usage
const monitor = new CachePerformanceMonitor();
await monitor.start();
```

## Best Practices for Debugging

1. **Start with debug Mode**: Enable debug mode as your first step when debugging.

2. **Isolate the Problem**: Focus on specific keys or operations rather than the entire cache.

3. **Use Pattern Matching Carefully**: Be specific with patterns when debugging to avoid processing too many entries.

4. **Check for Expiration Issues**: TTL-related problems are common; verify expiration timing.

5. **Monitor Memory Usage**: Track memory consumption to identify potential leaks or size issues.

6. **Test in Isolation**: Create minimal test cases that reproduce the issue.

7. **Verify Source Functions**: Ensure source functions return properly formatted data and handle errors.

8. **Check Middleware Order**: The order of middleware can affect behavior.

9. **Look for Race Conditions**: Concurrent operations can cause unexpected behavior.

10. **Clean Up Debugging Tools**: Remove or disable debug logging and debugging tools in production to avoid performance impacts.

## Next Steps

After mastering debugging and logging in RunCache, explore these related topics:

- [Performance Optimization](./performance.md) - Learn how to optimize cache performance
- [Resource Management](../advanced/resource-management.md) - Understand memory management and cleanup
- [Best Practices](./best-practices.md) - Explore general best practices for RunCache
- [Middleware](../advanced/middleware.md) - Learn more about middleware capabilities 