# Serialization Adapters

RunCache's serialization system allows you to cache complex JavaScript types that go beyond basic JSON serialization. This includes Date objects, Maps, Sets, RegExp, BigInt, class instances, and more.

## Overview

The serialization system consists of:

- **Default Serialization**: Automatic JSON serialization for basic types
- **Custom Adapters**: Specialized serialization for complex types
- **Adapter Management**: Priority-based adapter selection
- **Extensibility**: Create your own adapters for custom types

## Built-in Adapters

RunCache includes adapters for common JavaScript types that aren't natively JSON serializable:

### Date Serialization

```typescript
import { DateSerializationAdapter } from 'run-cache';

// Add the Date adapter
RunCache.addSerializationAdapter(new DateSerializationAdapter());

// Cache Date objects directly
const event = {
  id: 1,
  name: 'Conference 2024',
  startDate: new Date('2024-06-15T09:00:00Z'),
  endDate: new Date('2024-06-17T17:00:00Z')
};

await RunCache.set({ key: 'event:1', value: event });
const retrievedEvent = await RunCache.get('event:1');

// Dates are properly restored as Date objects
console.log(retrievedEvent.startDate instanceof Date); // true
console.log(retrievedEvent.startDate.getFullYear()); // 2024
```

### Map Serialization

```typescript
import { MapSerializationAdapter } from 'run-cache';

RunCache.addSerializationAdapter(new MapSerializationAdapter());

// Cache Map objects
const userPreferences = new Map<string, any>([
  ['theme', 'dark'],
  ['language', 'en'],
  ['notifications', { email: true, push: false }],
  ['lastLogin', new Date()]
]);

await RunCache.set({ key: 'preferences:123', value: userPreferences });
const retrieved = await RunCache.get('preferences:123');

console.log(retrieved instanceof Map); // true
console.log(retrieved.get('theme')); // 'dark'
```

### Set Serialization

```typescript
import { SetSerializationAdapter } from 'run-cache';

RunCache.addSerializationAdapter(new SetSerializationAdapter());

// Cache Set objects
const userRoles = new Set(['user', 'editor', 'admin']);
const permissions = new Set([
  { action: 'read', resource: 'posts' },
  { action: 'write', resource: 'posts' },
  { action: 'delete', resource: 'posts' }
]);

await RunCache.set({ key: 'roles:123', value: userRoles });
await RunCache.set({ key: 'permissions:123', value: permissions });

const retrievedRoles = await RunCache.get('roles:123');
console.log(retrievedRoles.has('admin')); // true
```

### RegExp Serialization

```typescript
import { RegExpSerializationAdapter } from 'run-cache';

RunCache.addSerializationAdapter(new RegExpSerializationAdapter());

// Cache RegExp objects
const validationRules = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/i,
  phone: /^\+?[\d\s\-\(\)]+$/,
  username: /^[a-zA-Z0-9_]{3,20}$/
};

await RunCache.set({ key: 'validation:rules', value: validationRules });
const retrieved = await RunCache.get('validation:rules');

console.log(retrieved.email instanceof RegExp); // true
console.log(retrieved.email.test('user@example.com')); // true
```

### BigInt Serialization

```typescript
import { BigIntSerializationAdapter } from 'run-cache';

RunCache.addSerializationAdapter(new BigIntSerializationAdapter());

// Cache BigInt values
const largeNumbers = {
  maxSafeInteger: BigInt(Number.MAX_SAFE_INTEGER),
  customLarge: BigInt('123456789012345678901234567890'),
  calculation: BigInt(2) ** BigInt(100)
};

await RunCache.set({ key: 'large:numbers', value: largeNumbers });
const retrieved = await RunCache.get('large:numbers');

console.log(typeof retrieved.maxSafeInteger); // 'bigint'
console.log(retrieved.calculation > BigInt(2) ** BigInt(99)); // true
```

### URL Serialization

```typescript
import { URLSerializationAdapter } from 'run-cache';

RunCache.addSerializationAdapter(new URLSerializationAdapter());

// Cache URL objects
const endpoints = {
  api: new URL('https://api.example.com/v1/users'),
  cdn: new URL('https://cdn.example.com/assets'),
  webhook: new URL('https://webhooks.example.com/callback?token=abc')
};

await RunCache.set({ key: 'endpoints', value: endpoints });
const retrieved = await RunCache.get('endpoints');

console.log(retrieved.api instanceof URL); // true
console.log(retrieved.api.hostname); // 'api.example.com'
```

## Composite Serialization

Use the composite adapter to handle multiple types automatically:

```typescript
import { 
  CompositeSerializationAdapter,
  DateSerializationAdapter,
  MapSerializationAdapter,
  SetSerializationAdapter,
  RegExpSerializationAdapter,
  createStandardSerializationAdapter
} from 'run-cache';

// Option 1: Manual composition
const composite = new CompositeSerializationAdapter();
composite.addAdapter(new DateSerializationAdapter());
composite.addAdapter(new MapSerializationAdapter());
composite.addAdapter(new SetSerializationAdapter());
composite.addAdapter(new RegExpSerializationAdapter());

RunCache.setSerializationAdapter(composite);

// Option 2: Use the standard adapter (includes common types)
const standardAdapter = createStandardSerializationAdapter();
RunCache.setSerializationAdapter(standardAdapter);

// Now cache complex objects with mixed types
const complexData = {
  createdAt: new Date(),
  patterns: {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    phone: /^\+?[\d\s\-\(\)]+$/
  },
  userRoles: new Set(['admin', 'editor']),
  metadata: new Map([
    ['version', '1.0'],
    ['lastModified', new Date()]
  ]),
  bigNumber: BigInt('999999999999999999999')
};

await RunCache.set({ key: 'complex:data', value: complexData });
const retrieved = await RunCache.get('complex:data');

// All types are properly restored
console.log(retrieved.createdAt instanceof Date);
console.log(retrieved.patterns.email instanceof RegExp);
console.log(retrieved.userRoles instanceof Set);
console.log(retrieved.metadata instanceof Map);
console.log(typeof retrieved.bigNumber === 'bigint');
```

## TypedArray Support

Cache typed arrays like Int32Array, Float64Array, etc.:

```typescript
import { createTypedArrayAdapters } from 'run-cache';

// Add all typed array adapters
const typedArrayAdapters = createTypedArrayAdapters();
typedArrayAdapters.forEach(adapter => {
  RunCache.addSerializationAdapter(adapter);
});

// Cache typed arrays
const audioData = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
const imagePixels = new Uint8Array([255, 128, 64, 0, 255, 255]);
const bigInts = new BigInt64Array([BigInt(1), BigInt(2), BigInt(3)]);

await RunCache.set({ key: 'audio:sample', value: audioData });
await RunCache.set({ key: 'image:pixels', value: imagePixels });
await RunCache.set({ key: 'big:ints', value: bigInts });

const retrievedAudio = await RunCache.get('audio:sample');
console.log(retrievedAudio instanceof Float32Array); // true
console.log(Array.from(retrievedAudio)); // [0.1, 0.2, 0.3, 0.4, 0.5]
```

## Custom Class Instances

Serialize and deserialize custom class instances:

```typescript
// Define a class
class User {
  constructor(
    public id: number,
    public name: string,
    public email: string
  ) {}

  greet(): string {
    return `Hello, I'm ${this.name}`;
  }

  isAdmin(): boolean {
    return this.email.endsWith('@admin.com');
  }
}

// Create a custom adapter for the User class
import { ClassInstanceSerializationAdapter } from 'run-cache';

const userAdapter = new ClassInstanceSerializationAdapter(
  User,
  'User',
  // Custom constructor function
  (data: any) => new User(data.id, data.name, data.email)
);

RunCache.addSerializationAdapter(userAdapter);

// Cache User instances
const user = new User(1, 'John Doe', 'john@admin.com');
await RunCache.set({ key: 'user:1', value: user });

const retrievedUser = await RunCache.get('user:1');
console.log(retrievedUser instanceof User); // true
console.log(retrievedUser.greet()); // "Hello, I'm John Doe"
console.log(retrievedUser.isAdmin()); // true
```

## Buffer Support (Node.js)

For Node.js environments, cache Buffer objects:

```typescript
import { BufferSerializationAdapter } from 'run-cache';

if (typeof Buffer !== 'undefined') {
  RunCache.addSerializationAdapter(new BufferSerializationAdapter());
}

// Cache binary data
const imageBuffer = Buffer.from('binary image data', 'base64');
const textBuffer = Buffer.from('Hello, World!', 'utf8');

await RunCache.set({ key: 'image:thumbnail', value: imageBuffer });
await RunCache.set({ key: 'text:content', value: textBuffer });

const retrievedImage = await RunCache.get('image:thumbnail');
console.log(Buffer.isBuffer(retrievedImage)); // true
```

## Creating Custom Adapters

Create your own serialization adapters for custom types:

```typescript
import { SerializationAdapter } from 'run-cache';

// Example: Adapter for a custom Money class
class Money {
  constructor(
    public amount: number,
    public currency: string
  ) {}

  toString(): string {
    return `${this.amount} ${this.currency}`;
  }
}

class MoneySerializationAdapter implements SerializationAdapter<Money> {
  serialize(value: Money): string {
    return JSON.stringify({
      __type__: 'Money',
      amount: value.amount,
      currency: value.currency
    });
  }

  deserialize(serialized: string): Money {
    try {
      const parsed = JSON.parse(serialized);
      if (parsed.__type__ === 'Money') {
        return new Money(parsed.amount, parsed.currency);
      }
    } catch (error) {
      // Handle parsing errors
    }
    throw new Error('Invalid Money serialization');
  }

  canHandle(value: any): boolean {
    return value instanceof Money;
  }
}

// Register the custom adapter
RunCache.addSerializationAdapter(new MoneySerializationAdapter());

// Use the custom type
const price = new Money(99.99, 'USD');
await RunCache.set({ key: 'product:price', value: price });

const retrievedPrice = await RunCache.get('product:price');
console.log(retrievedPrice instanceof Money); // true
console.log(retrievedPrice.toString()); // "99.99 USD"
```

## Advanced Adapter Patterns

### Generic Adapters

Create adapters that work with multiple related types:

```typescript
class DateTimeAdapter implements SerializationAdapter<Date | string> {
  serialize(value: Date | string): string {
    const dateValue = value instanceof Date ? value : new Date(value);
    return JSON.stringify({
      __type__: 'DateTime',
      iso: dateValue.toISOString(),
      timestamp: dateValue.getTime()
    });
  }

  deserialize(serialized: string): Date {
    const parsed = JSON.parse(serialized);
    if (parsed.__type__ === 'DateTime') {
      return new Date(parsed.iso);
    }
    throw new Error('Invalid DateTime serialization');
  }

  canHandle(value: any): boolean {
    return value instanceof Date || 
           (typeof value === 'string' && !isNaN(Date.parse(value)));
  }
}
```

### Conditional Serialization

Adapters that apply different strategies based on data:

```typescript
class SmartObjectAdapter implements SerializationAdapter<any> {
  serialize(value: any): string {
    // Detect the type and apply appropriate serialization
    if (value instanceof Date) {
      return this.serializeDate(value);
    } else if (value instanceof Map) {
      return this.serializeMap(value);
    } else {
      return JSON.stringify(value);
    }
  }

  deserialize(serialized: string): any {
    const parsed = JSON.parse(serialized);
    
    switch (parsed.__type__) {
      case 'Date':
        return new Date(parsed.value);
      case 'Map':
        return new Map(parsed.entries);
      default:
        return parsed;
    }
  }

  canHandle(value: any): boolean {
    return value !== null && typeof value === 'object';
  }

  private serializeDate(date: Date): string {
    return JSON.stringify({ __type__: 'Date', value: date.toISOString() });
  }

  private serializeMap(map: Map<any, any>): string {
    return JSON.stringify({ __type__: 'Map', entries: Array.from(map.entries()) });
  }
}
```

## Adapter Priority and Management

Adapters are processed in the order they're added (most recent first):

```typescript
// Higher priority adapters are added last
RunCache.addSerializationAdapter(new GenericObjectAdapter()); // Lower priority
RunCache.addSerializationAdapter(new DateSerializationAdapter()); // Higher priority
RunCache.addSerializationAdapter(new CustomUserAdapter()); // Highest priority

// The most specific adapter that can handle the type will be used
```

### Managing Adapters

```typescript
// Clear all custom adapters
RunCache.clearSerializationAdapters();

// Add a new set of adapters
const adapters = [
  new DateSerializationAdapter(),
  new MapSerializationAdapter(),
  new CustomUserAdapter()
];

adapters.forEach(adapter => RunCache.addSerializationAdapter(adapter));
```

## Performance Considerations

### Serialization Overhead

- Simple adapters (Date, RegExp): < 5% overhead
- Complex adapters (Map, Set): < 15% overhead
- Custom class instances: 10-25% overhead depending on complexity

### Best Practices

1. **Use Specific Adapters**: More specific adapters are generally faster
2. **Minimize Adapter Chain**: Don't add unnecessary adapters
3. **Cache Adapter Results**: For frequently serialized types
4. **Test Performance**: Benchmark critical paths with your specific data

```typescript
// Performance testing example
async function benchmarkSerialization<T>(
  key: string, 
  value: T, 
  iterations: number = 1000
): Promise<number> {
  const start = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    await RunCache.set({ key: `${key}:${i}`, value });
    await RunCache.get(`${key}:${i}`);
  }
  
  const end = performance.now();
  return end - start;
}

// Test different serialization approaches
const simpleObject = { id: 1, name: 'test' };
const complexObject = {
  date: new Date(),
  map: new Map([['key', 'value']]),
  regex: /test/g
};

const simpleTime = await benchmarkSerialization('simple', simpleObject);
const complexTime = await benchmarkSerialization('complex', complexObject);

console.log(`Simple: ${simpleTime}ms, Complex: ${complexTime}ms`);
```

## Error Handling

Handle serialization failures gracefully:

```typescript
class SafeSerializationAdapter implements SerializationAdapter<any> {
  serialize(value: any): string {
    try {
      return JSON.stringify({
        __type__: 'Safe',
        data: this.deepSerialize(value)
      });
    } catch (error) {
      console.warn('Serialization failed:', error);
      return JSON.stringify({
        __type__: 'Safe',
        data: null,
        error: error.message
      });
    }
  }

  deserialize(serialized: string): any {
    try {
      const parsed = JSON.parse(serialized);
      if (parsed.__type__ === 'Safe') {
        if (parsed.error) {
          console.warn('Cached value had serialization error:', parsed.error);
          return null;
        }
        return parsed.data;
      }
    } catch (error) {
      console.warn('Deserialization failed:', error);
      return null;
    }
  }

  canHandle(value: any): boolean {
    return true; // Fallback adapter
  }

  private deepSerialize(obj: any): any {
    // Custom serialization logic with error handling
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return { __date__: obj.toISOString() };
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepSerialize(item));
    }

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      try {
        result[key] = this.deepSerialize(value);
      } catch (error) {
        console.warn(`Failed to serialize property ${key}:`, error);
        result[key] = null;
      }
    }
    return result;
  }
}
```

## Next Steps

- Learn about [Type Validation](type-validation.md) for runtime type checking
- Explore [Performance Optimization](../guides/performance.md) for caching strategies
- See the [API Reference](../api/serialization-system.md) for complete adapter interfaces
- Check out [Best Practices](../guides/best-practices.md) for serialization patterns