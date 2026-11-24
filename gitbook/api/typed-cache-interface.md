# Typed Cache Interface

`RunCache.createTypedCache<T>()` returns a thin wrapper around the static RunCache methods with `T` filled in, so you do not have to repeat the type parameter on every call. It does not create a separate cache: every typed cache reads and writes the same global store, and the typing is compile-time only (see [Type Safety](../advanced/type-validation.md)).

The class itself (`TypedCacheInterface`) is not exported; use `ReturnType<typeof RunCache.createTypedCache<User>>` if you need to name the type.

## Class: TypedCacheInterface<T>

Created using `RunCache.createTypedCache<T>()`, this interface provides all standard cache operations with strong typing for the specified type `T`.

### Type Parameters

- `T` - The type of values that will be cached in this interface

## Cache Operations

### `set(options)`

Sets a cache entry. Same as `RunCache.set<T>()`.

**Parameters:**

- `options`: `Object` - Cache entry options
  - `key`: `string` - Unique identifier for the cache entry
  - `value?`: `T` - Typed value to cache (required if no sourceFn)
  - `ttl?`: `number` - Time-to-live in milliseconds
  - `autoRefetch?`: `boolean` - Automatically refetch on expiry (requires ttl and sourceFn)
  - `sourceFn?`: `() => T | Promise<T>` - Function to generate typed cache value (required if no value)
  - `tags?`: `string[]` - Array of tags for tag-based invalidation
  - `dependencies?`: `string[]` - Array of cache keys this entry depends on

**Returns:** `Promise<boolean>` - Returns `true` if the value was successfully set

**Example:**

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  profile?: {
    avatar?: string;
    bio?: string;
  };
}

const userCache = RunCache.createTypedCache<User>();

// Type-safe setting
await userCache.set({
  key: 'user:123',
  value: {
    id: 123,
    name: 'John Doe',
    email: 'john@example.com',
    profile: {
      avatar: 'https://example.com/avatar.jpg',
      bio: 'Software developer'
    }
  },
  ttl: 3600000 // 1 hour
});

// With source function
await userCache.set({
  key: 'user:456',
  sourceFn: async (): Promise<User> => {
    const response = await fetch('/api/users/456');
    return response.json();
  },
  ttl: 1800000, // 30 minutes
  autoRefetch: true
});

// TypeScript will catch type errors at compile time
// await userCache.set({
//   key: 'user:789',
//   value: { id: '789', name: 'Jane' } // ❌ Type error: id should be number
// });
```

### `get(key)`

Retrieves a typed cache entry by key or pattern.

**Parameters:**

- `key`: `string` - The key to retrieve, or a pattern with wildcards

**Returns:** `Promise<T | T[] | undefined>`
- If `key` is a specific key, returns the typed value or undefined if not found
- If `key` is a pattern, returns an array of matching typed values

**Example:**

```typescript
// Get a specific user
const user = await userCache.get('user:123');
if (user) {
  console.log(user.name); // TypeScript knows this is a string
  console.log(user.id); // TypeScript knows this is a number
  console.log(user.profile?.bio); // Optional chaining with type safety
}

// Get multiple users with pattern matching
const allUsers = await userCache.get('user:*');
if (Array.isArray(allUsers)) {
  allUsers.forEach(u => {
    console.log(`${u.name} (${u.email})`); // Full type safety
  });
}
```

### `has(key)`

Checks if a valid (non-expired) cache entry exists.

**Parameters:**

- `key`: `string` - The key to check, or a pattern with wildcards

**Returns:** `Promise<boolean>`

**Example:**

```typescript
const exists = await userCache.has('user:123');
if (exists) {
  console.log('User is cached');
}

// Check if any users are cached
const hasAnyUsers = await userCache.has('user:*');
```

### `delete(key)`

Removes a cache entry or entries matching a pattern.

**Parameters:**

- `key`: `string` - The key to delete, or a pattern with wildcards

**Returns:** `Promise<boolean>` - `true` if at least one entry was deleted

**Example:**

```typescript
// Delete a specific user
await userCache.delete('user:123');

// Delete all users
await userCache.delete('user:*');
```

### `refetch(key)`

Runs the stored `sourceFn` again for an entry, or for every entry matching a pattern.

**Parameters:**

- `key`: `string` - The key to refresh, or a pattern with wildcards

**Returns:** `Promise<boolean>` - `true` if at least one entry was refetched

**Example:**

```typescript
// Refresh a specific user
await userCache.refetch('user:123');

// Refresh all users
await userCache.refetch('user:*');
```

## Event System Integration

The typed cache has `onExpiry`, `onKeyExpiry`, `onRefetch`, `onKeyRefetch`, `onRefetchFailure` and `onKeyRefetchFailure`. They register the same listeners as the static RunCache methods, so:

- `onExpiry`, `onRefetch` and `onRefetchFailure` fire for **every** key in the cache, not only keys set through this typed cache. Use the `onKey...` variants with a pattern to scope them.
- `event.value` is the entry's stored form: strings as they were set, other values as their JSON string, even though it is typed as `T`. Parse it when you need the object.

### Event Registration

```typescript
// Scope listeners to this cache's keys with a pattern
await userCache.onKeyExpiry('user:*', (event) => {
  // event.value is the stored JSON string for object values
  const user = JSON.parse(event.value as unknown as string) as User;
  console.log(`User ${user.name} expired from cache`);
});

await userCache.onKeyRefetch('user:*', (event) => {
  console.log(`User cache refreshed: ${event.key}`);
});

await userCache.onKeyRefetchFailure('user:*', (event) => {
  console.error(`Failed to refresh user: ${event.key}`, event.error);
});
```

## Advanced Usage Patterns

### Repository Pattern

Use typed cache interfaces to implement repository patterns:

```typescript
class UserRepository {
  private cache = RunCache.createTypedCache<User>();

  async findById(id: number): Promise<User | undefined> {
    // get() is typed T | T[] | undefined because a key may be a wildcard pattern
    return (await this.cache.get(`user:${id}`)) as User | undefined;
  }

  async save(user: User, ttl?: number): Promise<void> {
    await this.cache.set({
      key: `user:${user.id}`,
      value: user,
      ttl: ttl || 3600000, // Default 1 hour
      tags: ['user', `user:${user.id}`]
    });
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const users = await this.cache.get('user:*');
    if (Array.isArray(users)) {
      return users.find(u => u.email === email);
    }
    return undefined;
  }

  async invalidateUser(id: number): Promise<void> {
    await this.cache.delete(`user:${id}`);
  }

  async refreshUser(id: number): Promise<void> {
    await this.cache.refetch(`user:${id}`);
  }
}

// Usage
const userRepo = new UserRepository();
const user = await userRepo.findById(123);
if (user) {
  console.log(user.name); // Fully typed
}
```

### Service Layer Integration

Integrate typed caches with service layers:

```typescript
interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  inStock: boolean;
}

class ProductService {
  private cache = RunCache.createTypedCache<Product>();

  async getProduct(id: number): Promise<Product | null> {
    // Try cache first
    const cached = (await this.cache.get(`product:${id}`)) as Product | undefined;
    if (cached) {
      return cached;
    }

    // Fetch from database/API
    const product = await this.fetchProductFromDB(id);
    if (product) {
      // Cache with 30-minute TTL
      await this.cache.set({
        key: `product:${id}`,
        value: product,
        ttl: 1800000,
        tags: ['product', `category:${product.category}`]
      });
    }

    return product;
  }

  async updateProduct(product: Product): Promise<void> {
    await this.updateProductInDB(product);

    // Update cache
    await this.cache.set({
      key: `product:${product.id}`,
      value: product,
      ttl: 1800000,
      tags: ['product', `category:${product.category}`]
    });
  }

  async invalidateCategory(category: string): Promise<void> {
    // Tag invalidation is only on RunCache; it covers entries set through any typed cache
    await RunCache.invalidateByTag(`category:${category}`);
  }

  private async fetchProductFromDB(id: number): Promise<Product | null> {
    // Database fetch logic
    return null; // Placeholder
  }

  private async updateProductInDB(product: Product): Promise<void> {
    // Database update logic
  }
}
```

### Multi-Type Cache Management

Manage multiple typed caches in a single class:

```typescript
interface Order {
  id: number;
  userId: number;
  products: Product[];
  total: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered';
}

class CacheManager {
  private userCache = RunCache.createTypedCache<User>();
  private productCache = RunCache.createTypedCache<Product>();
  private orderCache = RunCache.createTypedCache<Order>();

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return (await this.userCache.get(`user:${id}`)) as User | undefined;
  }

  async setUser(user: User): Promise<void> {
    await this.userCache.set({
      key: `user:${user.id}`,
      value: user,
      ttl: 3600000,
      tags: ['user']
    });
  }

  // Product operations
  async getProduct(id: number): Promise<Product | undefined> {
    return (await this.productCache.get(`product:${id}`)) as Product | undefined;
  }

  async setProduct(product: Product): Promise<void> {
    await this.productCache.set({
      key: `product:${product.id}`,
      value: product,
      ttl: 1800000,
      tags: ['product', `category:${product.category}`]
    });
  }

  // Order operations
  async getOrder(id: number): Promise<Order | undefined> {
    return (await this.orderCache.get(`order:${id}`)) as Order | undefined;
  }

  async setOrder(order: Order): Promise<void> {
    await this.orderCache.set({
      key: `order:${order.id}`,
      value: order,
      ttl: 7200000, // 2 hours
      tags: ['order', `user:${order.userId}`],
      dependencies: [`user:${order.userId}`]
    });
  }

  // Cross-type operations
  async getUserOrders(userId: number): Promise<Order[]> {
    const orders = await this.orderCache.get('order:*');
    if (Array.isArray(orders)) {
      return orders.filter(order => order.userId === userId);
    }
    return [];
  }

  async invalidateUserData(userId: number): Promise<void> {
    await this.userCache.delete(`user:${userId}`);
    await RunCache.invalidateByTag(`user:${userId}`);
  }
}
```

## Type Safety Benefits

### Compile-Time Type Checking

```typescript
interface StrictUser {
  id: number;
  name: string;
  email: string;
  createdAt: string; // ISO date: a Date would come back from get() as a string
}

const strictUserCache = RunCache.createTypedCache<StrictUser>();

// ✅ Valid usage
await strictUserCache.set({
  key: 'user:1',
  value: {
    id: 1,
    name: 'John',
    email: 'john@example.com',
    createdAt: new Date().toISOString()
  }
});

// ❌ Compile-time errors
/*
await strictUserCache.set({
  key: 'user:2',
  value: {
    id: '2', // ❌ Type error: string not assignable to number
    name: 'Jane',
    email: 'jane@example.com'
    // ❌ Type error: missing required property 'createdAt'
  }
});
*/
```

### Runtime Type Validation

The type parameter is not checked at runtime, and no cache method accepts a validator. See [Type Safety](../advanced/type-validation.md#adding-a-runtime-check) for checking values after reading them.

## Performance Considerations

Typed cache interfaces have minimal overhead compared to the main RunCache:

- **Type Checking**: Zero runtime cost (compile-time only)
- **Memory Usage**: Same as main RunCache (just a wrapper)
- **Serialization**: Same as RunCache: non-string values are stored as JSON
- **Method Calls**: One extra function call per operation

## Best Practices

1. **Use for Consistent Types**: Create typed interfaces for types you cache frequently
2. **Repository Pattern**: Combine with repository patterns for clean architecture
3. **Service Integration**: Integrate with service layers for business logic separation
4. **Runtime Checks**: Validate values that may come from outside your control after reading them
5. **Event Handling**: Scope listeners with the `onKey...` methods and a key pattern

## Next Steps

- Learn about [Value Serialization](../advanced/serialization-adapters.md) for complex types
- Read [Type Safety](../advanced/type-validation.md) for runtime checking
- See [Best Practices](../guides/best-practices.md) for typed caching patterns
- Check the main [RunCache API](run-cache.md) for additional methods