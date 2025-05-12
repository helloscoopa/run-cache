# Debugging and Logging

This guide provides techniques and strategies for debugging issues in RunCache and implementing effective logging. By following these recommendations, you can identify and resolve problems more quickly and gain better visibility into cache operations.

## Built-in Logging

RunCache includes built-in logging capabilities through its verbose mode.

### Enabling Verbose Mode

To enable verbose logging:

```typescript
import { RunCache } from 'run-cache';

// Enable verbose logging
RunCache.configure({
  verbose: true
});
```

When verbose mode is enabled, RunCache logs detailed information about:
- Cache operations (set, get, delete, etc.)
- Entry expiration and eviction
- Refetch operations and failures
- Configuration changes

All logs include timestamps and operation details.

### Disabling Verbose Mode

To disable verbose logging when you're done debugging:

```typescript
// Disable verbose logging
RunCache.configure({
  verbose: false
});
```

## Custom Logging with Middleware

You can implement more detailed custom logging using middleware.

### Basic Logging Middleware

```typescript
import { RunCache } from 'run-cache';

// Add logging middleware
RunCache.use(async (value, context, next) => {
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
RunCache.use(async (value, context, next) => {
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
RunCache.use(async (value, context, next) => {
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
RunCache.onExpiry((event) => {
  console.log(`[RunCache] Key expired: ${event.key}, TTL: ${event.ttl}ms`);
});

// Monitor refetch events
RunCache.onRefetch((event) => {
  console.log(`[RunCache] Key refreshed: ${event.key}`);
});

// Monitor refetch failures
RunCache.onRefetchFailure((event) => {
  console.error(`[RunCache] Refresh failed for key: ${event.key}`, event.error);
});

// Monitor tag invalidations
RunCache.onTagInvalidation((event) => {
  console.log(`[RunCache] Key invalidated by tag: ${event.key}, Tag: ${event.tag}`);
});

// Monitor dependency invalidations
RunCache.onDependencyInvalidation((event) => {
  console.log(`[RunCache] Key invalidated by dependency: ${event.key}, Dependency: ${event.dependencyKey}`);
});
```

### Monitoring Specific Keys

For debugging issues with specific keys:

```typescript
// Monitor operations on a specific key
RunCache.onKeyExpiry('important-data', (event) => {
  console.log(`[RunCache] Important data expired at ${new Date().toISOString()}`);
});

RunCache.onKeyRefetch('important-data', (event) => {
  console.log(`[RunCache] Important data refreshed at ${new Date().toISOString()}`);
});

RunCache.onKeyRefetchFailure('important-data', (event) => {
  console.error(`[RunCache] Important data refresh failed:`, event.error);
});
```

### Using Patterns for Grouped Monitoring

You can use patterns to monitor groups of related keys:

```typescript
// Monitor all user-related expirations
RunCache.onKeyExpiry('user:*', (event) => {
  console.log(`[RunCache] User data expired: ${event.key}`);
});

// Monitor all API-related refresh failures
RunCache.onKeyRefetchFailure('api:*', (event) => {
  console.error(`[RunCache] API data refresh failed: ${event.key}`, event.error);
});
```

## Debugging Common Issues

### Diagnosing Cache Misses

If you're experiencing unexpected cache misses:

```typescript
// Debug cache misses with middleware
RunCache.use(async (value, context, next) => {
  if (context.operation === 'get') {
    const result = await next(value);
    if (!result) {
      console.log(`[RunCache] Cache miss for key: ${context.key}`);
      
      // Check if the key exists but is expired
      // Note: This is internal API usage for debugging only
      const internalCache = RunCache.getInternalCache();
      if (internalCache.has(context.key)) {
        const entry = internalCache.get(context.key);
        if (entry && entry.ttl && Date.now() > entry.updatedAt + entry.ttl) {
          console.log(`[RunCache] Key ${context.key} exists but has expired. ` +
                      `Expired at ${new Date(entry.updatedAt + entry.ttl).toISOString()}`);
        } else {
          console.log(`[RunCache] Key ${context.key} exists but returned no value.`);
        }
      }
    }
    return result;
  }
  return next(value);
});
```

### Debugging TTL Issues

If entries are expiring too soon or not expiring when expected:

```typescript
// Add TTL debugging middleware
RunCache.use(async (value, context, next) => {
  if (context.operation === 'set' && context.ttl) {
    console.log(
      `[RunCache] Setting key ${context.key} with TTL ${context.ttl}ms, ` +
      `will expire at ${new Date(Date.now() + context.ttl).toISOString()}`
    );
  }
  return next(value);
});

// Monitor all expiry events
RunCache.onExpiry((event) => {
  console.log(
    `[RunCache] Key ${event.key} expired. ` +
    `TTL was ${event.ttl}ms. ` +
    `Last updated at ${new Date(event.updatedAt).toISOString()}, ` +
    `expired at ${new Date(event.updatedAt + event.ttl).toISOString()}`
  );
});
```

### Debugging Automatic Refetching

If automatic refetching isn't working as expected:

```typescript
// Debug auto-refetch setup
RunCache.use(async (value, context, next) => {
  if (context.operation === 'set' && context.autoRefetch) {
    console.log(
      `[RunCache] Setting up auto-refetch for key ${context.key}. ` +
      `TTL: ${context.ttl}ms, Source function provided: ${!!context.sourceFn}`
    );
    
    if (!context.ttl) {
      console.warn(`[RunCache] Warning: Auto-refetch enabled for ${context.key} but no TTL provided.`);
    }
    
    if (!context.sourceFn) {
      console.warn(`[RunCache] Warning: Auto-refetch enabled for ${context.key} but no source function provided.`);
    }
  }
  return next(value);
});

// Monitor refetch events and failures
RunCache.onRefetch((event) => {
  console.log(`[RunCache] Auto-refetch successful for key: ${event.key}`);
});

RunCache.onRefetchFailure((event) => {
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
        `Result length: ${result ? result.length : 0}`
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
    const data = await response.json();
    return JSON.stringify(data);
  }),
  ttl: 60000,
  autoRefetch: true
});
```

### Debugging Storage Adapters

If you're having issues with persistent storage:

```typescript
// Add storage debugging
const originalSave = storageAdapter.save;
const originalLoad = storageAdapter.load;

storageAdapter.save = async function(data) {
  console.log(`[RunCache] Saving ${data.length} bytes to storage`);
  try {
    await originalSave.call(this, data);
    console.log(`[RunCache] Successfully saved to storage`);
  } catch (error) {
    console.error(`[RunCache] Failed to save to storage:`, error);
    throw error;
  }
};

storageAdapter.load = async function() {
  console.log(`[RunCache] Loading from storage`);
  try {
    const data = await originalLoad.call(this);
    console.log(`[RunCache] Successfully loaded ${data ? data.length : 0} bytes from storage`);
    return data;
  } catch (error) {
    console.error(`[RunCache] Failed to load from storage:`, error);
    throw error;
  }
};

// Then configure RunCache with the patched adapter
RunCache.configure({
  storageAdapter: storageAdapter
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

export function setupCacheLogging() {
  // Add logging middleware
  RunCache.use(async (value, context, next) => {
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
  RunCache.onExpiry((event) => {
    logger.debug(`Key expired: ${event.key}`, { 
      event: 'expire',
      key: event.key,
      ttl: event.ttl,
      updatedAt: event.updatedAt
    });
  });
  
  RunCache.onRefetch((event) => {
    logger.debug(`Key refreshed: ${event.key}`, { 
      event: 'refetch',
      key: event.key
    });
  });
  
  RunCache.onRefetchFailure((event) => {
    logger.error(`Refresh failed for key: ${event.key}`, { 
      event: 'refetch_failure',
      key: event.key,
      error: event.error.message,
      stack: event.error.stack
    });
  });
  
  RunCache.onTagInvalidation((event) => {
    logger.debug(`Key invalidated by tag: ${event.key}`, { 
      event: 'tag_invalidation',
      key: event.key,
      tag: event.tag
    });
  });
  
  RunCache.onDependencyInvalidation((event) => {
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
RunCache.configure({ verbose: true });

// Use browser dev tools
// 1. Set breakpoints in source functions
// 2. Monitor network requests for fetch operations
// 3. Use console.trace() to see call stacks
// 4. Watch for errors in the console

// Add a global debug function
window.__debugRunCache = function(pattern = '*') {
  return {
    entries: RunCache.get(pattern),
    config: RunCache.getConfig(),
    // Add any other debug info you need
  };
};

// In browser console, you can now run:
// > window.__debugRunCache('user:*')
```

### Node.js Debugging

For Node.js environments:

```typescript
// Enable inspector
// Start Node with: node --inspect your-script.js

// Add debug endpoints to Express app
app.get('/debug/cache', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).send('Not available in production');
  }
  
  const pattern = req.query.pattern || '*';
  const entries = RunCache.get(pattern);
  const config = RunCache.getConfig();
  
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

Create a utility for inspecting the cache:

```typescript
// cache-inspector.js
export class CacheInspector {
  static async getEntries(pattern = '*') {
    const entries = await RunCache.get(pattern);
    return Array.isArray(entries) ? entries : [entries].filter(Boolean);
  }
  
  static async getKeys(pattern = '*') {
    // Implementation depends on internal APIs
    // This is for illustration purposes
    const internalCache = RunCache.getInternalCache();
    return Array.from(internalCache.keys())
      .filter(key => key.includes(pattern.replace('*', '')));
  }
  
  static async getStats() {
    const keys = await this.getKeys();
    const values = await Promise.all(keys.map(key => RunCache.get(key)));
    
    const totalSize = values.reduce((size, value) => {
      return size + (value ? value.length : 0);
    }, 0);
    
    return {
      entryCount: keys.length,
      totalSize,
      averageSize: keys.length ? totalSize / keys.length : 0
    };
  }
  
  static async analyzePatterns() {
    const keys = await this.getKeys();
    const patterns = {};
    
    // Simple pattern analysis
    keys.forEach(key => {
      const parts = key.split(':');
      const prefix = parts[0];
      patterns[prefix] = (patterns[prefix] || 0) + 1;
    });
    
    return patterns;
  }
}
```

### Performance Monitoring Utility

Create a utility for monitoring cache performance:

```typescript
// cache-performance.js
export class CachePerformanceMonitor {
  constructor() {
    this.metrics = {
      operations: {
        get: { count: 0, hits: 0, misses: 0, totalTime: 0 },
        set: { count: 0, totalTime: 0 },
        delete: { count: 0, totalTime: 0 }
      },
      events: {
        expire: 0,
        refetch: 0,
        refetch_failure: 0,
        tag_invalidation: 0,
        dependency_invalidation: 0
      }
    };
    
    this.setupMonitoring();
  }
  
  setupMonitoring() {
    // Add performance middleware
    RunCache.use(async (value, context, next) => {
      const start = performance.now();
      const result = await next(value);
      const duration = performance.now() - start;
      
      if (this.metrics.operations[context.operation]) {
        this.metrics.operations[context.operation].count++;
        this.metrics.operations[context.operation].totalTime += duration;
        
        if (context.operation === 'get') {
          if (result) {
            this.metrics.operations.get.hits++;
          } else {
            this.metrics.operations.get.misses++;
          }
        }
      }
      
      return result;
    });
    
    // Track events
    RunCache.onExpiry(() => this.metrics.events.expire++);
    RunCache.onRefetch(() => this.metrics.events.refetch++);
    RunCache.onRefetchFailure(() => this.metrics.events.refetch_failure++);
    RunCache.onTagInvalidation(() => this.metrics.events.tag_invalidation++);
    RunCache.onDependencyInvalidation(() => this.metrics.events.dependency_invalidation++);
  }
  
  getMetrics() {
    const metrics = JSON.parse(JSON.stringify(this.metrics));
    
    // Add calculated metrics
    const hitRatio = metrics.operations.get.hits / 
                     (metrics.operations.get.hits + metrics.operations.get.misses || 1);
    metrics.hitRatio = hitRatio;
    
    for (const [op, data] of Object.entries(metrics.operations)) {
      if (data.count > 0) {
        data.avgTime = data.totalTime / data.count;
      }
    }
    
    return metrics;
  }
  
  resetMetrics() {
    for (const op in this.metrics.operations) {
      this.metrics.operations[op] = { 
        count: 0, 
        totalTime: 0,
        ...(op === 'get' ? { hits: 0, misses: 0 } : {})
      };
    }
    
    for (const event in this.metrics.events) {
      this.metrics.events[event] = 0;
    }
  }
}
```

## Best Practices for Debugging

1. **Start with Verbose Mode**: Enable verbose mode as your first step when debugging.

2. **Isolate the Problem**: Focus on specific keys or operations rather than the entire cache.

3. **Use Pattern Matching Carefully**: Be specific with patterns when debugging to avoid processing too many entries.

4. **Check for Expiration Issues**: TTL-related problems are common; verify expiration timing.

5. **Monitor Memory Usage**: Track memory consumption to identify potential leaks or size issues.

6. **Test in Isolation**: Create minimal test cases that reproduce the issue.

7. **Verify Source Functions**: Ensure source functions return properly formatted data and handle errors.

8. **Check Middleware Order**: The order of middleware can affect behavior.

9. **Look for Race Conditions**: Concurrent operations can cause unexpected behavior.

10. **Clean Up Debugging Tools**: Remove or disable verbose logging and debugging tools in production to avoid performance impacts.

## Next Steps

After mastering debugging and logging in RunCache, explore these related topics:

- [Performance Optimization](./performance.md) - Learn how to optimize cache performance
- [Resource Management](../advanced/resource-management.md) - Understand memory management and cleanup
- [Best Practices](./best-practices.md) - Explore general best practices for RunCache
- [Middleware](../advanced/middleware.md) - Learn more about middleware capabilities 