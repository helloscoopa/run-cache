# Migration Guide

This guide helps you upgrade from string-only RunCache usage to the new typed caching features. The migration is designed to be gradual and non-breaking - your existing code will continue to work unchanged.

## Overview

RunCache now supports any serializable JavaScript type while maintaining 100% backward compatibility with existing string-based code. You can migrate incrementally, updating different parts of your application at your own pace.

## Migration Strategy

### Phase 1: No Changes Required

Your existing code continues to work without any modifications:

```typescript
// This code works exactly as before
await RunCache.set({ key: 'user:name', value: 'John Doe' });
const name = await RunCache.get('user:name'); // string | undefined

// JSON stringified objects also work as before
const userData = { id: 1, name: 'John' };
await RunCache.set({ key: 'user:1', value: JSON.stringify(userData) });
const userJson = await RunCache.get('user:1'); // string | undefined
const user = userJson ? JSON.parse(userJson) : null;
```

### Phase 2: Gradual Type Adoption

Start using types for new code while keeping existing code unchanged:

```typescript
// New typed code
interface User {
  id: number;
  name: string;
  email: string;
}

const user: User = { id: 1, name: 'John', email: 'john@example.com' };
await RunCache.set<User>({ key: 'typed:user:1', value: user });

// Existing string-based code continues to work
await RunCache.set({ key: 'legacy:user:name', value: 'John Doe' });
```

### Phase 3: Convert Existing Code

Gradually convert existing string-based code to use types:

```typescript
// Before: Manual JSON stringification
const userData = { id: 1, name: 'John', email: 'john@example.com' };
await RunCache.set({ 
  key: 'user:1', 
  value: JSON.stringify(userData) 
});
const userJson = await RunCache.get('user:1');
const user = userJson ? JSON.parse(userJson) : null;

// After: Automatic serialization with types
interface User {
  id: number;
  name: string;
  email: string;
}

const userData: User = { id: 1, name: 'John', email: 'john@example.com' };
await RunCache.set<User>({ key: 'user:1', value: userData });
const user = await RunCache.get<User>('user:1'); // User | undefined
```

## Common Migration Patterns

### 1. Simple Object Caching

**Before:**
```typescript
const config = { theme: 'dark', language: 'en' };
await RunCache.set({ key: 'config', value: JSON.stringify(config) });

const configJson = await RunCache.get('config');
const parsedConfig = configJson ? JSON.parse(configJson) : null;
```

**After:**
```typescript
interface Config {
  theme: 'light' | 'dark';
  language: string;
}

const config: Config = { theme: 'dark', language: 'en' };
await RunCache.set<Config>({ key: 'config', value: config });

const parsedConfig = await RunCache.get<Config>('config'); // Config | undefined
```

### 2. API Response Caching

**Before:**
```typescript
async function fetchUserData(userId: number) {
  const cacheKey = `user:${userId}`;
  
  // Check cache
  const cached = await RunCache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Fetch from API
  const response = await fetch(`/api/users/${userId}`);
  const userData = await response.json();
  
  // Cache the stringified result
  await RunCache.set({ 
    key: cacheKey, 
    value: JSON.stringify(userData),
    ttl: 300000 
  });
  
  return userData;
}
```

**After:**
```typescript
interface User {
  id: number;
  name: string;
  email: string;
  profile: {
    avatar?: string;
    bio?: string;
  };
}

async function fetchUserData(userId: number): Promise<User | null> {
  const cacheKey = `user:${userId}`;
  
  // Check cache with type safety
  const cached = await RunCache.get<User>(cacheKey);
  if (cached) {
    return cached; // No parsing needed, already typed
  }
  
  // Fetch from API
  const response = await fetch(`/api/users/${userId}`);
  const userData: User = await response.json();
  
  // Cache with automatic serialization
  await RunCache.set<User>({ 
    key: cacheKey, 
    value: userData,
    ttl: 300000 
  });
  
  return userData;
}
```

### 3. Source Functions with Types

**Before:**
```typescript
await RunCache.set({
  key: 'weather:current',
  sourceFn: async () => {
    const response = await fetch('/api/weather');
    const data = await response.json();
    return JSON.stringify(data); // Manual stringification
  },
  ttl: 300000
});

const weatherJson = await RunCache.get('weather:current');
const weather = weatherJson ? JSON.parse(weatherJson) : null;
```

**After:**
```typescript
interface WeatherData {
  temperature: number;
  humidity: number;
  condition: string;
  location: string;
}

await RunCache.set<WeatherData>({
  key: 'weather:current',
  sourceFn: async (): Promise<WeatherData> => {
    const response = await fetch('/api/weather');
    return response.json(); // Return typed object directly
  },
  ttl: 300000
});

const weather = await RunCache.get<WeatherData>('weather:current'); // WeatherData | undefined
```

### 4. Array and Collection Caching

**Before:**
```typescript
const products = [
  { id: 1, name: 'Laptop', price: 999 },
  { id: 2, name: 'Mouse', price: 29 }
];

await RunCache.set({ 
  key: 'products:featured', 
  value: JSON.stringify(products) 
});

const productsJson = await RunCache.get('products:featured');
const productList = productsJson ? JSON.parse(productsJson) : [];
```

**After:**
```typescript
interface Product {
  id: number;
  name: string;
  price: number;
}

const products: Product[] = [
  { id: 1, name: 'Laptop', price: 999 },
  { id: 2, name: 'Mouse', price: 29 }
];

await RunCache.set<Product[]>({ 
  key: 'products:featured', 
  value: products 
});

const productList = await RunCache.get<Product[]>('products:featured'); // Product[] | undefined
```

## Benefits of Migration

### Type Safety
- Compile-time error checking
- IntelliSense and auto-completion
- Reduced runtime errors

### Developer Experience
- No manual JSON.stringify/parse
- Clear interface definitions
- Better code documentation

### Maintainability
- Easier refactoring
- Self-documenting code
- Consistent data structures

## Migration Tools and Utilities

### Type Detection Utilities

You can use these utilities to help with migration:

```typescript
// Helper function to detect if a cached value is typed or legacy
function isLegacyStringValue(value: string): boolean {
  try {
    JSON.parse(value);
    return true; // It's a JSON string
  } catch {
    return true; // It's a plain string
  }
}

// Migration helper for gradual conversion
async function migrateToTyped<T>(key: string): Promise<T | undefined> {
  const value = await RunCache.get(key);
  if (typeof value === 'string') {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(value);
      // Re-cache as typed value
      await RunCache.set<T>({ key, value: parsed });
      return parsed;
    } catch {
      // It's a plain string, leave as is
      return undefined;
    }
  }
  return value as T;
}
```

### Batch Migration

For large-scale migrations, you can use pattern matching:

```typescript
async function migrateUserCache() {
  // Get all user cache keys
  const userValues = await RunCache.get('user:*');
  
  if (Array.isArray(userValues)) {
    for (const value of userValues) {
      if (typeof value === 'string') {
        try {
          const userData = JSON.parse(value);
          const key = `user:${userData.id}`;
          
          // Migrate to typed cache
          await RunCache.delete(key); // Remove old entry
          await RunCache.set<User>({ key, value: userData });
        } catch (error) {
          console.warn(`Failed to migrate user cache: ${error}`);
        }
      }
    }
  }
}
```

## Mixed Usage Patterns

You can safely mix string and typed caching in the same application:

```typescript
// Legacy string caching
await RunCache.set({ key: 'legacy:config', value: 'production' });

// Modern typed caching
interface AppSettings {
  theme: string;
  version: string;
}

await RunCache.set<AppSettings>({ 
  key: 'modern:settings', 
  value: { theme: 'dark', version: '2.0.0' } 
});

// Both work together
const legacyConfig = await RunCache.get('legacy:config'); // string | undefined
const modernSettings = await RunCache.get<AppSettings>('modern:settings'); // AppSettings | undefined
```

## Testing Migration

When migrating, ensure your tests cover both legacy and new patterns:

```typescript
describe('Migration Tests', () => {
  it('should support legacy string caching', async () => {
    await RunCache.set({ key: 'test:legacy', value: 'string value' });
    const result = await RunCache.get('test:legacy');
    expect(result).toBe('string value');
  });

  it('should support new typed caching', async () => {
    interface TestData { id: number; name: string; }
    const data: TestData = { id: 1, name: 'test' };
    
    await RunCache.set<TestData>({ key: 'test:typed', value: data });
    const result = await RunCache.get<TestData>('test:typed');
    
    expect(result).toEqual(data);
    expect(typeof result?.id).toBe('number');
  });

  it('should handle mixed usage', async () => {
    await RunCache.set({ key: 'test:string', value: 'legacy' });
    await RunCache.set<number>({ key: 'test:number', value: 42 });

    const stringResult = await RunCache.get('test:string');
    const numberResult = await RunCache.get<number>('test:number');

    expect(stringResult).toBe('legacy');
    expect(numberResult).toBe(42);
  });
});
```

## Performance Considerations

The migration to typed caching has minimal performance impact:

- **Memory Usage**: Similar to string caching
- **Serialization**: Optimized for common types
- **CPU Overhead**: Less than 5% increase for complex objects
- **Network**: No impact on cache size

## Common Pitfalls and Solutions

### 1. Circular References

**Problem:**
```typescript
const obj: any = { name: 'test' };
obj.self = obj; // Circular reference

await RunCache.set({ key: 'circular', value: obj }); // Will fail
```

**Solution:**
```typescript
// Use custom serialization or break circular references
const safeObj = { 
  name: obj.name,
  // Don't include circular properties
};
await RunCache.set({ key: 'safe', value: safeObj });
```

### 2. Date Objects

**Problem:**
```typescript
const data = { timestamp: new Date() };
await RunCache.set({ key: 'date', value: data });
const retrieved = await RunCache.get('date');
// retrieved.timestamp is now a string, not Date
```

**Solution:**
```typescript
// Use serialization adapters for Date objects
import { DateSerializationAdapter } from 'run-cache';

RunCache.addSerializationAdapter(new DateSerializationAdapter());

// Now Date objects are properly serialized/deserialized
```

### 3. Function Properties

Functions cannot be serialized and will be lost:

**Problem:**
```typescript
const obj = {
  data: 'value',
  method: () => 'hello' // This will be lost
};
```

**Solution:**
```typescript
// Only cache serializable data
const serializableObj = {
  data: obj.data
  // Don't include functions
};
```

## Timeline Recommendations

### Week 1: Setup and Planning
- Update to the latest RunCache version
- Identify areas for migration
- Define TypeScript interfaces

### Week 2-3: New Features
- Use typed caching for all new features
- Create typed cache repositories
- Update documentation

### Week 4-6: Gradual Migration
- Convert high-traffic cache operations
- Update API response caching
- Migrate critical data structures

### Week 7+: Complete Migration
- Convert remaining string-based caching
- Remove manual JSON.stringify/parse
- Update tests and documentation

## Next Steps

- Explore [Serialization Adapters](../advanced/serialization-adapters.md) for custom types
- Learn about [Type Validation](../advanced/type-validation.md) for runtime checking
- Review [Best Practices](best-practices.md) for typed caching
- Check the [API Reference](../api/run-cache.md) for complete method signatures