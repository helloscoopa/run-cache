# Serialization System API

The RunCache serialization system provides extensible type serialization for caching complex JavaScript types. This API reference covers all serialization interfaces, adapters, and utilities.

## Core Interfaces

### `SerializationAdapter<T>`

The base interface for creating custom serialization adapters.

```typescript
interface SerializationAdapter<T = any> {
  serialize(value: T): string;
  deserialize(serialized: string): T;
  canHandle(value: any): boolean;
}
```

**Methods:**

- `serialize(value: T): string` - Converts a value to a serialized string
- `deserialize(serialized: string): T` - Reconstructs a value from serialized string
- `canHandle(value: any): boolean` - Determines if this adapter can handle the given value

**Example Implementation:**

```typescript
class CustomDateAdapter implements SerializationAdapter<Date> {
  serialize(value: Date): string {
    return JSON.stringify({
      __type__: 'CustomDate',
      iso: value.toISOString(),
      timestamp: value.getTime()
    });
  }

  deserialize(serialized: string): Date {
    try {
      const parsed = JSON.parse(serialized);
      if (parsed.__type__ === 'CustomDate') {
        return new Date(parsed.iso);
      }
    } catch (error) {
      console.warn('Failed to deserialize CustomDate:', error);
    }
    throw new Error('Invalid CustomDate serialization');
  }

  canHandle(value: any): boolean {
    return value instanceof Date;
  }
}
```

### `TypeValidator<T>`

Interface for runtime type validation during cache operations.

```typescript
interface TypeValidator<T> {
  validate(value: any): value is T;
  name: string;
}
```

**Properties:**

- `name: string` - Human-readable name for the validator

**Methods:**

- `validate(value: any): value is T` - Type guard function that validates and narrows type

## Built-in Adapters

### `DefaultSerializationAdapter`

The fallback adapter that handles basic JSON serialization.

```typescript
class DefaultSerializationAdapter implements SerializationAdapter {
  serialize(value: any): string;
  deserialize(serialized: string): any;
  canHandle(value: any): boolean; // Always returns true
}
```

**Behavior:**
- For strings: Returns the string unchanged
- For other values: Uses `JSON.stringify()`
- Deserialization: Attempts `JSON.parse()`, falls back to original string

### `DateSerializationAdapter`

Handles Date object serialization with timezone preservation.

```typescript
class DateSerializationAdapter implements SerializationAdapter<Date> {
  serialize(value: Date): string;
  deserialize(serialized: string): Date;
  canHandle(value: any): boolean; // Returns value instanceof Date
}
```

**Features:**
- Preserves timezone information
- Handles invalid dates gracefully
- Serializes to ISO string format with type metadata

**Example:**

```typescript
import { DateSerializationAdapter } from 'run-cache';

const adapter = new DateSerializationAdapter();
const date = new Date('2024-12-25T10:30:00Z');

const serialized = adapter.serialize(date);
console.log(serialized); // '{"__type__":"Date","value":"2024-12-25T10:30:00.000Z"}'

const deserialized = adapter.deserialize(serialized);
console.log(deserialized instanceof Date); // true
console.log(deserialized.getTime() === date.getTime()); // true
```

### `MapSerializationAdapter`

Handles Map object serialization with support for any key/value types.

```typescript
class MapSerializationAdapter implements SerializationAdapter<Map<any, any>> {
  serialize(value: Map<any, any>): string;
  deserialize(serialized: string): Map<any, any>;
  canHandle(value: any): boolean; // Returns value instanceof Map
}
```

**Features:**
- Supports any serializable key/value types
- Preserves Map iteration order
- Handles nested Maps and complex values

**Example:**

```typescript
import { MapSerializationAdapter } from 'run-cache';

const adapter = new MapSerializationAdapter();
const map = new Map([
  ['string-key', 'value'],
  [42, { nested: 'object' }],
  ['date', new Date()]
]);

const serialized = adapter.serialize(map);
const deserialized = adapter.deserialize(serialized);

console.log(deserialized instanceof Map); // true
console.log(deserialized.get('string-key')); // 'value'
console.log(deserialized.get(42)); // { nested: 'object' }
```

### `SetSerializationAdapter`

Handles Set object serialization while preserving uniqueness.

```typescript
class SetSerializationAdapter implements SerializationAdapter<Set<any>> {
  serialize(value: Set<any>): string;
  deserialize(serialized: string): Set<any>;
  canHandle(value: any): boolean; // Returns value instanceof Set
}
```

**Example:**

```typescript
import { SetSerializationAdapter } from 'run-cache';

const adapter = new SetSerializationAdapter();
const set = new Set(['a', 'b', 'c', 1, 2, 3]);

const serialized = adapter.serialize(set);
const deserialized = adapter.deserialize(serialized);

console.log(deserialized instanceof Set); // true
console.log(deserialized.size); // 6
console.log(deserialized.has('a')); // true
```

### `RegExpSerializationAdapter`

Handles RegExp object serialization with flags preservation.

```typescript
class RegExpSerializationAdapter implements SerializationAdapter<RegExp> {
  serialize(value: RegExp): string;
  deserialize(serialized: string): RegExp;
  canHandle(value: any): boolean; // Returns value instanceof RegExp
}
```

**Example:**

```typescript
import { RegExpSerializationAdapter } from 'run-cache';

const adapter = new RegExpSerializationAdapter();
const regex = /hello\s+world/gim;

const serialized = adapter.serialize(regex);
const deserialized = adapter.deserialize(serialized);

console.log(deserialized instanceof RegExp); // true
console.log(deserialized.source); // 'hello\\s+world'
console.log(deserialized.flags); // 'gim'
console.log(deserialized.test('Hello   World')); // true
```

### `BigIntSerializationAdapter`

Handles BigInt serialization for large integers.

```typescript
class BigIntSerializationAdapter implements SerializationAdapter<BigInt> {
  serialize(value: BigInt): string;
  deserialize(serialized: string): BigInt;
  canHandle(value: any): boolean; // Returns typeof value === 'bigint'
}
```

**Example:**

```typescript
import { BigIntSerializationAdapter } from 'run-cache';

const adapter = new BigIntSerializationAdapter();
const bigInt = BigInt('123456789012345678901234567890');

const serialized = adapter.serialize(bigInt);
const deserialized = adapter.deserialize(serialized);

console.log(typeof deserialized); // 'bigint'
console.log(deserialized === bigInt); // true
```

### `URLSerializationAdapter`

Handles URL object serialization.

```typescript
class URLSerializationAdapter implements SerializationAdapter<URL> {
  serialize(value: URL): string;
  deserialize(serialized: string): URL;
  canHandle(value: any): boolean; // Returns value instanceof URL
}
```

### `ErrorSerializationAdapter`

Handles Error object serialization with stack trace preservation.

```typescript
class ErrorSerializationAdapter implements SerializationAdapter<Error> {
  serialize(value: Error): string;
  deserialize(serialized: string): Error;
  canHandle(value: any): boolean; // Returns value instanceof Error
}
```

### `BufferSerializationAdapter` (Node.js only)

Handles Buffer object serialization for binary data.

```typescript
class BufferSerializationAdapter implements SerializationAdapter<Buffer> {
  serialize(value: Buffer): string;
  deserialize(serialized: string): Buffer;
  canHandle(value: any): boolean; // Returns Buffer.isBuffer(value)
}
```

## Composite Adapters

### `CompositeSerializationAdapter`

Manages multiple serialization adapters with priority-based selection.

```typescript
class CompositeSerializationAdapter implements SerializationAdapter<any> {
  addAdapter(adapter: SerializationAdapter): void;
  removeAdapter(adapter: SerializationAdapter): void;
  clearAdapters(): void;
  serialize(value: any): string;
  deserialize(serialized: string): any;
  canHandle(value: any): boolean; // Always returns true (fallback)
}
```

**Methods:**

- `addAdapter(adapter)` - Adds an adapter with high priority
- `removeAdapter(adapter)` - Removes a specific adapter
- `clearAdapters()` - Removes all custom adapters

**Example:**

```typescript
import { 
  CompositeSerializationAdapter,
  DateSerializationAdapter,
  MapSerializationAdapter 
} from 'run-cache';

const composite = new CompositeSerializationAdapter();
composite.addAdapter(new DateSerializationAdapter());
composite.addAdapter(new MapSerializationAdapter());

// The composite will automatically choose the right adapter
const date = new Date();
const map = new Map([['key', 'value']]);

const serializedDate = composite.serialize(date);
const serializedMap = composite.serialize(map);

const deserializedDate = composite.deserialize(serializedDate);
const deserializedMap = composite.deserialize(serializedMap);

console.log(deserializedDate instanceof Date); // true
console.log(deserializedMap instanceof Map); // true
```

## Factory Functions

### `createStandardSerializationAdapter()`

Creates a composite adapter with commonly used serialization adapters.

```typescript
function createStandardSerializationAdapter(): CompositeSerializationAdapter
```

**Includes:**
- DateSerializationAdapter
- MapSerializationAdapter
- SetSerializationAdapter
- RegExpSerializationAdapter
- BigIntSerializationAdapter
- URLSerializationAdapter
- ErrorSerializationAdapter
- BufferSerializationAdapter (Node.js only)

**Example:**

```typescript
import { createStandardSerializationAdapter } from 'run-cache';

const adapter = createStandardSerializationAdapter();
RunCache.setSerializationAdapter(adapter);

// Now all standard types are automatically handled
await RunCache.set({ 
  key: 'complex-data', 
  value: {
    date: new Date(),
    pattern: /test/g,
    mapping: new Map([['key', 'value']]),
    collection: new Set([1, 2, 3]),
    url: new URL('https://example.com'),
    bigNumber: BigInt(123)
  }
});
```

### `createTypedArrayAdapters()`

Creates serialization adapters for all TypedArray types.

```typescript
function createTypedArrayAdapters(): SerializationAdapter[]
```

**Returns array of adapters for:**
- Int8Array, Uint8Array
- Int16Array, Uint16Array  
- Int32Array, Uint32Array
- Float32Array, Float64Array

**Example:**

```typescript
import { createTypedArrayAdapters } from 'run-cache';

const adapters = createTypedArrayAdapters();
adapters.forEach(adapter => {
  RunCache.addSerializationAdapter(adapter);
});

// Now TypedArrays are supported
const audioData = new Float32Array([0.1, 0.2, 0.3]);
await RunCache.set({ key: 'audio', value: audioData });

const retrieved = await RunCache.get('audio');
console.log(retrieved instanceof Float32Array); // true
```

## Class Instance Serialization

### `ClassInstanceSerializationAdapter<T>`

Generic adapter for serializing class instances with method preservation.

```typescript
class ClassInstanceSerializationAdapter<T> implements SerializationAdapter<T> {
  constructor(
    classConstructor: new (...args: any[]) => T,
    typeName: string,
    reconstructor?: (data: any) => T
  );
  
  serialize(value: T): string;
  deserialize(serialized: string): T;
  canHandle(value: any): boolean;
}
```

**Parameters:**

- `classConstructor` - The class constructor function
- `typeName` - Unique type name for serialization
- `reconstructor` - Optional custom reconstruction function

**Example:**

```typescript
class Person {
  constructor(
    public name: string,
    public age: number,
    public email: string
  ) {}

  greet(): string {
    return `Hello, I'm ${this.name}`;
  }

  isAdult(): boolean {
    return this.age >= 18;
  }
}

const personAdapter = new ClassInstanceSerializationAdapter(
  Person,
  'Person',
  (data) => new Person(data.name, data.age, data.email)
);

RunCache.addSerializationAdapter(personAdapter);

// Cache Person instances
const person = new Person('John', 30, 'john@example.com');
await RunCache.set({ key: 'person:1', value: person });

const retrieved = await RunCache.get('person:1');
console.log(retrieved instanceof Person); // true
console.log(retrieved.greet()); // "Hello, I'm John"
console.log(retrieved.isAdult()); // true
```

## TypedArray Support

### `TypedArraySerializationAdapter<T>`

Generic adapter for TypedArray serialization.

```typescript
class TypedArraySerializationAdapter<T extends TypedArray> 
  implements SerializationAdapter<T> {
  
  constructor(
    arrayConstructor: new (data: number[]) => T,
    typeName: string
  );
  
  serialize(value: T): string;
  deserialize(serialized: string): T;
  canHandle(value: any): boolean;
}
```

**Example:**

```typescript
import { TypedArraySerializationAdapter } from 'run-cache';

// Create adapter for specific typed array
const float32Adapter = new TypedArraySerializationAdapter(
  Float32Array,
  'Float32Array'
);

RunCache.addSerializationAdapter(float32Adapter);

const audioSample = new Float32Array([0.1, 0.2, 0.3, 0.4]);
await RunCache.set({ key: 'audio:sample', value: audioSample });

const retrieved = await RunCache.get('audio:sample');
console.log(retrieved instanceof Float32Array); // true
console.log(Array.from(retrieved)); // [0.1, 0.2, 0.3, 0.4]
```

## Cache Integration

### Adding Serialization Adapters

```typescript
// Add individual adapters
RunCache.addSerializationAdapter(new DateSerializationAdapter());
RunCache.addSerializationAdapter(new MapSerializationAdapter());

// Set a composite adapter
const composite = createStandardSerializationAdapter();
RunCache.setSerializationAdapter(composite);

// Clear all adapters (reset to default)
RunCache.clearSerializationAdapters();
```

### Adapter Priority

Adapters are processed in reverse order of addition (most recent first):

```typescript
RunCache.addSerializationAdapter(new GenericAdapter()); // Processed 3rd
RunCache.addSerializationAdapter(new DateAdapter());    // Processed 2nd  
RunCache.addSerializationAdapter(new SpecificAdapter()); // Processed 1st

// The most specific adapter that can handle the type will be used
```

## Error Handling

### Serialization Failures

```typescript
class SafeSerializationAdapter implements SerializationAdapter<any> {
  serialize(value: any): string {
    try {
      return this.doSerialization(value);
    } catch (error) {
      console.warn('Serialization failed:', error);
      return JSON.stringify({
        __type__: 'SerializationError',
        error: error.message,
        fallbackValue: null
      });
    }
  }

  deserialize(serialized: string): any {
    try {
      const parsed = JSON.parse(serialized);
      if (parsed.__type__ === 'SerializationError') {
        console.warn('Cached value had serialization error:', parsed.error);
        return parsed.fallbackValue;
      }
      return this.doDeserialization(parsed);
    } catch (error) {
      console.warn('Deserialization failed:', error);
      return null;
    }
  }

  canHandle(value: any): boolean {
    return true; // Fallback adapter
  }

  private doSerialization(value: any): string {
    // Custom serialization logic
    return JSON.stringify(value);
  }

  private doDeserialization(parsed: any): any {
    // Custom deserialization logic
    return parsed;
  }
}
```

### Validation Integration

```typescript
import { TypeValidator } from 'run-cache';

class ValidatingAdapter<T> implements SerializationAdapter<T> {
  constructor(
    private baseAdapter: SerializationAdapter<T>,
    private validator: TypeValidator<T>
  ) {}

  serialize(value: T): string {
    if (!this.validator.validate(value)) {
      throw new Error(`Invalid ${this.validator.name} for serialization`);
    }
    return this.baseAdapter.serialize(value);
  }

  deserialize(serialized: string): T {
    const result = this.baseAdapter.deserialize(serialized);
    if (!this.validator.validate(result)) {
      throw new Error(`Deserialized ${this.validator.name} failed validation`);
    }
    return result;
  }

  canHandle(value: any): boolean {
    return this.baseAdapter.canHandle(value) && this.validator.validate(value);
  }
}
```

## Performance Optimization

### Adapter Caching

```typescript
class CachedSerializationAdapter<T> implements SerializationAdapter<T> {
  private serializationCache = new Map<string, string>();
  private deserializationCache = new Map<string, T>();

  constructor(private baseAdapter: SerializationAdapter<T>) {}

  serialize(value: T): string {
    const key = this.createCacheKey(value);
    
    if (this.serializationCache.has(key)) {
      return this.serializationCache.get(key)!;
    }

    const serialized = this.baseAdapter.serialize(value);
    this.serializationCache.set(key, serialized);
    return serialized;
  }

  deserialize(serialized: string): T {
    if (this.deserializationCache.has(serialized)) {
      return this.deserializationCache.get(serialized)!;
    }

    const deserialized = this.baseAdapter.deserialize(serialized);
    this.deserializationCache.set(serialized, deserialized);
    return deserialized;
  }

  canHandle(value: any): boolean {
    return this.baseAdapter.canHandle(value);
  }

  private createCacheKey(value: T): string {
    return JSON.stringify(value);
  }
}
```

## Next Steps

- Learn about [Type Validation](../advanced/type-validation.md) for runtime checking
- Explore [Serialization Adapters](../advanced/serialization-adapters.md) usage guide
- See [Performance Optimization](../guides/performance.md) for serialization performance
- Check [Best Practices](../guides/best-practices.md) for serialization patterns