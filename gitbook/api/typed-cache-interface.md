# Typed Cache Interface

The `TypedCacheInterface<T>` provides a type-safe wrapper around RunCache operations for a specific type. This interface ensures compile-time type checking and better developer experience when working with consistently typed cache entries.

## Class: TypedCacheInterface<T>

Created using `RunCache.createTypedCache<T>()`, this interface provides all standard cache operations with strong typing for the specified type `T`.

### Type Parameters

- `T` - The type of values that will be cached in this interface

## Cache Operations

### `set(options)`

Sets a cache entry with type-safe value validation.

**Parameters:**

- `options`: `Object` - Cache entry options
  - `key`: `string` - Unique identifier for the cache entry
  - `value?`: `T` - Typed value to cache (required if no sourceFn)
  - `ttl?`: `number` - Time-to-live in milliseconds
  - `autoRefetch?`: `boolean` - Automatically refetch on expiry (requires ttl and sourceFn)
  - `sourceFn?`: `() => T | Promise<T>` - Function to generate typed cache value (required if no value)
  - `tags?`: `string[]` - Array of tags for tag-based invalidation
  - `dependencies?`: `string[]` - Array of cache keys this entry depends on
  - `metadata?`: `any` - Custom metadata to associate with the entry
  - `validator?`: `TypeValidator<T>` - Optional type validator for runtime checking

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

**Returns:** `Promise<void>`

**Example:**

```typescript
// Delete a specific user
await userCache.delete('user:123');

// Delete all users
await userCache.delete('user:*');
```

### `refetch(key, options?)`

Manually refreshes a cache entry or entries matching a pattern.

**Parameters:**

- `key`: `string` - The key to refresh, or a pattern with wildcards
- `options?`: `Object` - Optional refresh options
  - `metadata?`: `any` - Custom metadata to include in refetch events

**Returns:** `Promise<void>`

**Example:**

```typescript
// Refresh a specific user
await userCache.refetch('user:123');

// Refresh all users
await userCache.refetch('user:*');

// Refresh with metadata
await userCache.refetch('user:123', { 
  metadata: { reason: 'manual-refresh', userId: 123 } 
});
```

## Event System Integration

Typed cache interfaces work seamlessly with the event system, providing typed event parameters.

### Event Registration

```typescript
// Type-safe event handlers
userCache.onExpiry((event) => {
  console.log(`User ${event.value.name} expired from cache`);
  // event.value is typed as User
});

userCache.onRefetch((event) => {
  console.log(`User cache refreshed: ${event.key}`);
});

userCache.onRefetchFailure((event) => {
  console.error(`Failed to refresh user: ${event.error.message}`);
});
```

## Advanced Usage Patterns

### Repository Pattern

Use typed cache interfaces to implement repository patterns:

```typescript
class UserRepository {
  private cache = RunCache.createTypedCache<User>();
  
  async findById(id: number): Promise<User | undefined> {
    return this.cache.get(`user:${id}`);
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
    const cached = await this.cache.get(`product:${id}`);
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
    // This would require tag invalidation on the main RunCache
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
    return this.userCache.get(`user:${id}`);
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
    return this.productCache.get(`product:${id}`);
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
    return this.orderCache.get(`order:${id}`);
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
  createdAt: Date;
}

const strictUserCache = RunCache.createTypedCache<StrictUser>();

// ✅ Valid usage
await strictUserCache.set({
  key: 'user:1',
  value: {
    id: 1,
    name: 'John',
    email: 'john@example.com',
    createdAt: new Date()
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

Combine with type validators for runtime checking:

```typescript
import { ValidatorUtils, NumberValidator, StringValidator } from 'run-cache';

const userValidator = ValidatorUtils.object({
  id: NumberValidator,
  name: StringValidator,
  email: ValidatorUtils.string(email => email.includes('@')),
  createdAt: ValidatorUtils.instanceOf(Date)
});

await strictUserCache.set({
  key: 'user:1',
  value: userData,
  validator: userValidator, // Runtime validation
  validateOnSet: true
});
```

## Performance Considerations

Typed cache interfaces have minimal overhead compared to the main RunCache:

- **Type Checking**: Zero runtime cost (compile-time only)
- **Memory Usage**: Same as main RunCache (just a wrapper)
- **Serialization**: Same performance characteristics
- **Method Calls**: Minimal indirection overhead (< 1ms)

## Best Practices

1. **Use for Consistent Types**: Create typed interfaces for types you cache frequently
2. **Repository Pattern**: Combine with repository patterns for clean architecture
3. **Service Integration**: Integrate with service layers for business logic separation
4. **Type Validation**: Use runtime validators for critical data integrity
5. **Event Handling**: Leverage typed events for better debugging and monitoring

## Next Steps

- Learn about [Serialization Adapters](serialization-system.md) for complex types
- Explore [Type Validation](../advanced/type-validation.md) for runtime checking
- See [Best Practices](../guides/best-practices.md) for typed caching patterns
- Check the main [RunCache API](run-cache.md) for additional methods