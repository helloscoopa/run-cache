# Typed Caching

RunCache provides powerful TypeScript support that allows you to cache any serializable JavaScript value while maintaining full type safety. This guide covers the new typed features and how to use them effectively in your applications.

## Overview

The typed caching features include:

- **Generic Type Support**: Cache any JavaScript type with full TypeScript intellisense
- **Automatic Serialization**: Built-in serialization for objects, arrays, primitives, and special types
- **Type Safety**: Compile-time and runtime type checking
- **Backward Compatibility**: Existing string-based code continues to work unchanged
- **Custom Serialization**: Extensible serialization system for complex types

## Basic Typed Operations

### Simple Typed Values

```typescript
import { RunCache } from 'run-cache';

// Cache primitive types with automatic type inference
await RunCache.set<number>({ key: 'user-count', value: 42 });
await RunCache.set<boolean>({ key: 'feature-enabled', value: true });
await RunCache.set<string[]>({ key: 'tags', value: ['typescript', 'cache', 'performance'] });

// Retrieve values with full type safety
const count = await RunCache.get<number>('user-count'); // number | undefined
const enabled = await RunCache.get<boolean>('feature-enabled'); // boolean | undefined
const tags = await RunCache.get<string[]>('tags'); // string[] | undefined
```

### Complex Objects and Interfaces

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  preferences: {
    theme: 'light' | 'dark';
    notifications: boolean;
  };
}

const user: User = {
  id: 123,
  name: 'John Doe', 
  email: 'john@example.com',
  preferences: {
    theme: 'dark',
    notifications: true
  }
};

// Cache with full type safety
await RunCache.set<User>({ key: 'user:123', value: user });

// Retrieve with automatic type checking
const retrievedUser = await RunCache.get<User>('user:123');
if (retrievedUser) {
  console.log(retrievedUser.name); // TypeScript knows this is a string
  console.log(retrievedUser.preferences.theme); // 'light' | 'dark'
}
```

### Arrays and Collections

```typescript
interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
}

const products: Product[] = [
  { id: 1, name: 'Laptop', price: 999.99, category: 'Electronics' },
  { id: 2, name: 'Smartphone', price: 599.99, category: 'Electronics' },
  { id: 3, name: 'Coffee Mug', price: 12.99, category: 'Home' }
];

// Cache arrays with type safety
await RunCache.set<Product[]>({ 
  key: 'products:featured', 
  value: products,
  ttl: 300000 // 5 minutes
});

const featuredProducts = await RunCache.get<Product[]>('products:featured');
if (featuredProducts) {
  featuredProducts.forEach(product => {
    console.log(`${product.name}: $${product.price}`); // Full type checking
  });
}
```

## Typed Cache Instances

For better type safety and organization, you can create typed cache instances:

```typescript
// Create a typed cache for a specific type
const userCache = RunCache.createTypedCache<User>();

// All operations are now strongly typed for User objects
await userCache.set({ 
  key: 'user:456', 
  value: {
    id: 456,
    name: 'Jane Smith',
    email: 'jane@example.com',
    preferences: { theme: 'light', notifications: false }
  }
});

const user = await userCache.get('user:456'); // User | undefined
```

## Generic Types and APIs

RunCache works seamlessly with generic types and API response patterns:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: number;
}

interface UserList {
  users: User[];
  total: number;
  page: number;
}

// Cache API responses with nested generics
const apiResponse: ApiResponse<UserList> = {
  success: true,
  data: {
    users: [/* user data */],
    total: 150,
    page: 1
  },
  message: 'Users retrieved successfully',
  timestamp: Date.now()
};

await RunCache.set<ApiResponse<UserList>>({
  key: 'api:users:page:1',
  value: apiResponse,
  ttl: 600000 // 10 minutes
});

const cachedResponse = await RunCache.get<ApiResponse<UserList>>('api:users:page:1');
if (cachedResponse?.success) {
  console.log(`Found ${cachedResponse.data.total} users`);
}
```

## Source Functions with Types

Source functions work seamlessly with typed values:

```typescript
interface WeatherData {
  temperature: number;
  humidity: number;
  condition: 'sunny' | 'cloudy' | 'rainy' | 'snowy';
  location: string;
  timestamp: Date;
}

// Typed source function
const fetchWeatherData = async (city: string): Promise<WeatherData> => {
  const response = await fetch(`https://api.weather.com/v1/current?city=${city}`);
  const data = await response.json();
  
  return {
    temperature: data.temp,
    humidity: data.humidity,
    condition: data.condition,
    location: city,
    timestamp: new Date()
  };
};

// Cache with typed source function
await RunCache.set<WeatherData>({
  key: 'weather:new-york',
  sourceFn: () => fetchWeatherData('New York'),
  ttl: 300000, // 5 minutes
  autoRefetch: true
});

const weather = await RunCache.get<WeatherData>('weather:new-york');
if (weather) {
  console.log(`Temperature in ${weather.location}: ${weather.temperature}°F`);
}
```

## Union Types and Enums

RunCache supports complex TypeScript types including unions and enums:

```typescript
enum UserRole {
  ADMIN = 'admin',
  MODERATOR = 'moderator', 
  USER = 'user'
}

type NotificationPreference = 'email' | 'sms' | 'push' | 'none';

interface UserProfile {
  id: number;
  username: string;
  role: UserRole;
  notifications: NotificationPreference[];
  metadata?: Record<string, any>;
}

const profile: UserProfile = {
  id: 789,
  username: 'admin_user',
  role: UserRole.ADMIN,
  notifications: ['email', 'push'],
  metadata: { lastLogin: new Date().toISOString() }
};

await RunCache.set<UserProfile>({ key: 'profile:789', value: profile });

const userProfile = await RunCache.get<UserProfile>('profile:789');
if (userProfile?.role === UserRole.ADMIN) {
  console.log('User has admin privileges');
}
```

## Optional Properties and Partial Types

TypeScript's optional properties work naturally with RunCache:

```typescript
interface UserSettings {
  theme: 'light' | 'dark';
  language: string;
  timezone?: string;
  notifications?: {
    email?: boolean;
    push?: boolean;
    sms?: boolean;
  };
}

// Partial settings updates
const partialSettings: Partial<UserSettings> = {
  theme: 'dark',
  notifications: { email: true }
};

await RunCache.set<Partial<UserSettings>>({ 
  key: 'settings:partial:123', 
  value: partialSettings 
});

const settings = await RunCache.get<Partial<UserSettings>>('settings:partial:123');
if (settings?.theme) {
  console.log(`User prefers ${settings.theme} theme`);
}
```

## Advanced Patterns

### Conditional Types and Mapped Types

```typescript
type CacheableEntity = User | Product | UserProfile;

interface EntityCache<T extends CacheableEntity> {
  entity: T;
  lastModified: Date;
  version: number;
}

async function cacheEntity<T extends CacheableEntity>(
  id: string, 
  entity: T
): Promise<void> {
  const cacheEntry: EntityCache<T> = {
    entity,
    lastModified: new Date(),
    version: 1
  };
  
  await RunCache.set<EntityCache<T>>({
    key: `entity:${id}`,
    value: cacheEntry,
    ttl: 3600000 // 1 hour
  });
}

// Usage with type inference
await cacheEntity('user-123', user); // T inferred as User
await cacheEntity('product-456', products[0]); // T inferred as Product
```

### Repository Pattern with Types

```typescript
class TypedCacheRepository<T> {
  constructor(private prefix: string) {}

  async save(id: string, entity: T, ttl?: number): Promise<void> {
    await RunCache.set<T>({
      key: `${this.prefix}:${id}`,
      value: entity,
      ttl
    });
  }

  async findById(id: string): Promise<T | undefined> {
    return RunCache.get<T>(`${this.prefix}:${id}`);
  }

  async findAll(): Promise<T[]> {
    const results = await RunCache.get<T>(`${this.prefix}:*`);
    return Array.isArray(results) ? results : [];
  }

  async delete(id: string): Promise<void> {
    await RunCache.delete(`${this.prefix}:${id}`);
  }
}

// Create typed repositories
const userRepo = new TypedCacheRepository<User>('users');
const productRepo = new TypedCacheRepository<Product>('products');

// Usage with full type safety
await userRepo.save('123', user);
const foundUser = await userRepo.findById('123'); // User | undefined
const allUsers = await userRepo.findAll(); // User[]
```

## Integration with Existing Features

All existing RunCache features work seamlessly with typed values:

### Tags and Dependencies

```typescript
await RunCache.set<User>({
  key: 'user:123',
  value: user,
  tags: ['user', 'profile', 'active'],
  dependencies: ['user:session:123']
});

// Invalidate all user-related cache entries
await RunCache.invalidateByTag('user');
```

### Events with Types

```typescript
RunCache.onExpiry<User>((event) => {
  console.log(`User ${event.value.name} expired from cache`);
});

RunCache.onKeyExpiry<Product>('product:*', (event) => {
  console.log(`Product ${event.value.name} expired`);
});
```

### TTL and Auto-Refetch

```typescript
await RunCache.set<WeatherData>({
  key: 'weather:current',
  sourceFn: () => fetchWeatherData('London'),
  ttl: 300000,
  autoRefetch: true
});
```

## Backward Compatibility

Existing string-based code continues to work without any changes:

```typescript
// This still works exactly as before
await RunCache.set({ key: 'legacy:data', value: 'string value' });
const legacyData = await RunCache.get('legacy:data'); // string | undefined

// Mixed usage in the same application
await RunCache.set<User>({ key: 'modern:user', value: user });
await RunCache.set({ key: 'legacy:config', value: JSON.stringify(config) });
```

## Performance Considerations

Typed caching adds minimal overhead:

- **Serialization**: Automatic JSON serialization with optimizations for strings
- **Memory Usage**: Efficient in-memory storage with the same footprint as string caching
- **Type Checking**: Zero runtime cost for TypeScript type annotations
- **Custom Types**: Extensible serialization system for complex types

## Next Steps

- Learn about [Serialization Adapters](../advanced/serialization-adapters.md) for custom types
- Explore [Type Validation](../advanced/type-validation.md) for runtime type checking
- See the [Migration Guide](../guides/migration-guide.md) for upgrading existing code
- Check out [Best Practices](../guides/best-practices.md) for typed caching patterns