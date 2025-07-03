# RunCache Dynamic Typing Implementation Plan

## Overview
Transform RunCache from a string-only cache to a generic, type-safe cache that supports any serializable JavaScript value while maintaining backward compatibility.

## Phase 1: Core Type System Changes

### 1.1 Update Base Types (`src/types/`)

- [x] **Update `cache-state.ts`**
  ```typescript
  // Add generic type parameter
  export type SourceFn<T = string> = () => Promise<T> | T;

  export type CacheState<T = string> = {
    value: T;
    serializedValue?: string; // For persistence - only used internally
    createdAt: number;
    updatedAt: number;
    ttl?: number;
    autoRefetch?: boolean;
    fetching?: boolean;
    sourceFn?: SourceFn<T>;
    interval?: ReturnType<typeof setTimeout>;
    accessCount: number;
    lastAccessed: number;
    tags?: string[];
    dependencies?: string[];
  };
  ```

- [x] **Update `events.ts`**
  ```typescript
  export type EventParam<T = string> = {
    key: string;
    value: T;
    serializedValue?: string; // For compatibility with event handlers
    ttl?: number;
    createdAt: number;
    updatedAt: number;
    tag?: string;
    dependencyKey?: string;
  };

  export type EventFn<T = string> = (_params: EventParam<T>) => Promise<void> | void;
  ```

- [x] **Update `middleware.ts`**
  ```typescript
  export interface MiddlewareContext<T = string> {
    key: string;
    operation: 'get' | 'set' | 'delete' | 'has' | 'refetch';
    value?: T;
    serializedValue?: string;
    ttl?: number;
    autoRefetch?: boolean;
    timestamp: number;
  }

  export type MiddlewareFunction<T = string> = (
    _value: T,
    _context: MiddlewareContext<T>,
    _next: (_nextValue: T) => Promise<T>
  ) => Promise<T>;

  export interface MiddlewareManager<T = string> {
    use(_middleware: MiddlewareFunction<T>): MiddlewareManager<T>;
    clear(): MiddlewareManager<T>;
    execute(_value: T, _context: MiddlewareContext<T>): Promise<T>;
  }
  ```

### 1.2 Create Serialization System

- [x] **Create `src/core/serialization.ts`**

```typescript
export interface SerializationAdapter<T = any> {
  serialize(value: T): string;
  deserialize(serialized: string): T;
  canHandle(value: any): boolean;
}

export class DefaultSerializationAdapter implements SerializationAdapter {
  serialize(value: any): string {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  }

  deserialize(serialized: string): any {
    try {
      return JSON.parse(serialized);
    } catch {
      return serialized; // Assume it's a plain string
    }
  }

  canHandle(value: any): boolean {
    return true; // Default adapter handles everything
  }
}

export class SerializationManager {
  private adapters: SerializationAdapter[] = [];
  private defaultAdapter = new DefaultSerializationAdapter();

  addAdapter(adapter: SerializationAdapter): void {
    this.adapters.unshift(adapter); // Add to front for priority
  }

  serialize(value: any): string {
    const adapter = this.adapters.find(a => a.canHandle(value)) || this.defaultAdapter;
    return adapter.serialize(value);
  }

  deserialize<T>(serialized: string, hint?: any): T {
    // For backward compatibility, try to infer type from hint or use default
    const adapter = this.adapters.find(a => hint && a.canHandle(hint)) || this.defaultAdapter;
    return adapter.deserialize(serialized);
  }
}
```

## Phase 2: Core Implementation Changes

### 2.1 Update CacheStore (`src/core/cache-store.ts`)

- [x] **Implement serialization support**

```typescript
export class CacheStore<T = string> {
  private cache: Map<string, CacheState<T>>;
  private serialization: SerializationManager;
  
  constructor(config: CacheConfig = {}) {
    // ... existing constructor code
    this.serialization = new SerializationManager();
  }

  // New generic set method
  async set<K extends T>({
    key,
    value,
    ttl,
    sourceFn,
    autoRefetch,
    tags,
    dependencies,
  }: {
    key: string;
    value?: K;
    ttl?: number;
    autoRefetch?: boolean;
    sourceFn?: SourceFn<K>;
    tags?: string[];
    dependencies?: string[];
  }): Promise<boolean> {
    // Implementation that handles both T and K types
    // Serialize for storage but keep original type in memory
  }

  // New generic get method
  async get<K extends T = T>(key: string): Promise<K | K[] | undefined> {
    // Return the original typed value, not serialized
  }

  // Update storage serialization methods
  private serializeForStorage(): string {
    const entries: { [key: string]: any } = {};
    for (const [key, state] of this.cache.entries()) {
      entries[key] = {
        ...state,
        value: this.serialization.serialize(state.value),
        sourceFn: state.sourceFn ? state.sourceFn.toString() : undefined,
      };
    }
    // ... rest of serialization
  }
}
```

### 2.2 Update RunCache Facade (`src/run-cache.ts`)

- [x] **Add generic methods with serialization**

```typescript
export class RunCache {
  private static instance: CacheStore<any>;

  // Generic methods with default string type for backward compatibility
  static async set<T = string>(params: {
    key: string;
    value?: T;
    ttl?: number;
    autoRefetch?: boolean;
    sourceFn?: SourceFn<T>;
    tags?: string[];
    dependencies?: string[];
  }): Promise<boolean> {
    await RunCache.ensureInitialized();
    return RunCache.instance.set(params);
  }

  static async get<T = string>(key: string): Promise<T | T[] | undefined> {
    await RunCache.ensureInitialized();
    return RunCache.instance.get<T>(key);
  }

  // Type-safe event methods
  static async onExpiry<T = string>(callback: (event: EventParam<T>) => void | Promise<void>): Promise<void> {
    await RunCache.ensureInitialized();
    RunCache.instance.onExpiry(callback);
  }

  // Add new typed cache creation method
  static createTypedCache<T>(): TypedCacheInterface<T> {
    return new TypedCacheInterface<T>();
  }
}

- [x] **Create TypedCacheInterface class**
- [x] **Add comprehensive tests for typed functionality**

// New typed interface for better type safety
export class TypedCacheInterface<T> {
  async set(params: {
    key: string;
    value?: T;
    ttl?: number;
    autoRefetch?: boolean;
    sourceFn?: SourceFn<T>;
    tags?: string[];
    dependencies?: string[];
  }): Promise<boolean> {
    return RunCache.set<T>(params);
  }

  async get(key: string): Promise<T | T[] | undefined> {
    return RunCache.get<T>(key);
  }

  // ... other methods with proper typing
}
```

## Phase 3: Backward Compatibility Layer

### 3.1 Compatibility Checks

- [x] **Implement compatibility checks in cache-store.ts**

```typescript
// In cache-store.ts
private isLegacyStringValue(value: any): boolean {
  return typeof value === 'string' && !this.hasTypeMetadata(value);
}

private hasTypeMetadata(serialized: string): boolean {
  try {
    const parsed = JSON.parse(serialized);
    return parsed && typeof parsed === 'object' && '__type__' in parsed;
  } catch {
    return false;
  }
}
```

### 3.2 Migration Utilities

- [x] **Create migration utilities in src/utils/migration.ts**

```typescript
// src/utils/migration.ts
export class CacheMigrationUtils {
  static migrateStringCacheToTyped<T>(
    existingData: string,
    typeConstructor?: new (...args: any[]) => T
  ): T {
    // Handle migration from string-only cache
  }

  static detectValueType(serialized: string): 'string' | 'object' | 'array' | 'primitive' {
    // Type detection for migration
  }
}
```

## Phase 4: Enhanced Type Safety Features

### 4.1 Runtime Type Validation (`src/core/type-validation.ts`)

- [x] **Create runtime type validation system**
- [x] **Implement TypeValidator interface and SchemaValidator class**
- [x] **Create built-in validators (StringValidator, NumberValidator, etc.)**
- [x] **Add advanced validators (UnionValidator, ArrayValidator, ObjectValidator, etc.)**
- [x] **Create comprehensive test suite with 31 test cases**

```typescript
export interface TypeValidator<T> {
  validate(value: any): value is T;
  name: string;
}

export class SchemaValidator<T> implements TypeValidator<T> {
  constructor(
    private schema: (value: any) => value is T,
    public name: string
  ) {}

  validate(value: any): value is T {
    return this.schema(value);
  }
}

// Built-in validators
export const StringValidator = new SchemaValidator(
  (value): value is string => typeof value === 'string',
  'string'
);

export const NumberValidator = new SchemaValidator(
  (value): value is number => typeof value === 'number',
  'number'
);
```

### 4.2 Type-Safe Configuration

- [x] **Implement TypedCacheConfig interface for type-safe configuration**

```typescript
interface TypedCacheConfig<T> extends CacheConfig {
  typeValidator?: TypeValidator<T>;
  serializationAdapter?: SerializationAdapter<T>;
  enforceTypeChecking?: boolean;
  validateOnGet?: boolean;
  validateOnSet?: boolean;
  validationFailureAction?: 'throw' | 'warn' | 'ignore';
}
```

## Phase 5: Usage Examples and API Design

### 5.1 Basic Usage ✅

- [x] **Created comprehensive usage examples and tests** (`src/usage-examples.test.ts`)
  - Backward compatible string operations
  - New typed usage with interfaces 
  - Typed cache instances
  - Complex nested objects
  - Arrays and collections
  - Primitive types (number, boolean, string arrays)
  - Source functions with types
  - 17 comprehensive test cases covering all scenarios

```typescript
// Backward compatible - existing code works unchanged
await RunCache.set({ key: 'user:name', value: 'John Doe' });
const name = await RunCache.get('user:name'); // string

// New typed usage
interface User {
  id: number;
  name: string;
  email: string;
}

await RunCache.set<User>({ 
  key: 'user:123', 
  value: { id: 123, name: 'John', email: 'john@example.com' } 
});
const user = await RunCache.get<User>('user:123'); // User | undefined

// Typed cache instance
const userCache = RunCache.createTypedCache<User>();
await userCache.set({ key: 'user:456', value: userData });
const user2 = await userCache.get('user:456'); // User | undefined
```

### 5.2 Advanced Features ✅

- [x] **Implemented comprehensive serialization adapters** (`src/examples/serialization-adapters.ts`)
  - Date serialization adapter with timezone preservation
  - Map, Set, RegExp, BigInt, URL, Error, Buffer serialization adapters
  - Class instance serialization adapter with method preservation
  - TypedArray serialization adapters (Int8Array, Uint8Array, Float32Array, etc.)
  - CompositeSerializationAdapter for handling multiple types
  - 33 comprehensive test cases with 100% pass rate

- [x] **Type validation integration examples** (`src/usage-examples.test.ts`)
  - SchemaValidator usage with complex types
  - Union types, enum types, optional properties  
  - Complex validation scenarios with nested objects
  - Mixed type usage (string and typed values coexisting)

```typescript
// Custom serialization
class DateSerializationAdapter implements SerializationAdapter<Date> {
  serialize(value: Date): string {
    return JSON.stringify({ __type__: 'Date', value: value.toISOString() });
  }

  deserialize(serialized: string): Date {
    const parsed = JSON.parse(serialized);
    return new Date(parsed.value);
  }

  canHandle(value: any): boolean {
    return value instanceof Date;
  }
}

RunCache.addSerializationAdapter(new DateSerializationAdapter());

// Type validation
const userValidator = new SchemaValidator<User>(
  (value): value is User => 
    typeof value === 'object' && 
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.email === 'string',
  'User'
);

RunCache.configure({
  typeValidator: userValidator,
  enforceTypeChecking: true
});
```

## Phase 6: Testing Strategy

### 6.1 Test Categories

1. **Backward Compatibility Tests**
   - Existing string-based tests should pass unchanged
   - Legacy data loading from storage

2. **Type Safety Tests**
   - Generic type preservation
   - Type validation and errors
   - Serialization/deserialization roundtrips

3. **Mixed Usage Tests**
   - String and typed values in same cache
   - Type coercion edge cases

4. **Performance Tests**
   - Serialization overhead
   - Memory usage comparison

### 6.2 Example Test Structure

```typescript
describe('Typed RunCache', () => {
  interface TestUser {
    id: number;
    name: string;
  }

  it('should preserve types through cache operations', async () => {
    const user: TestUser = { id: 1, name: 'Test' };
    await RunCache.set<TestUser>({ key: 'user', value: user });
    const retrieved = await RunCache.get<TestUser>('user');
    
    expect(retrieved).toEqual(user);
    expect(typeof retrieved?.id).toBe('number');
  });

  it('should maintain backward compatibility', async () => {
    await RunCache.set({ key: 'legacy', value: 'string value' });
    const retrieved = await RunCache.get('legacy');
    expect(retrieved).toBe('string value');
  });
});
```

## Phase 7: Documentation Updates

### 7.1 API Documentation
- Update all method signatures with generic types
- Add usage examples for common scenarios
- Migration guide from string-only usage

### 7.2 Type Definition Examples
```typescript
// Common usage patterns
interface ApiResponse<T> {
  data: T;
  status: number;
  message: string;
}

// Cache API responses with proper typing
await RunCache.set<ApiResponse<User[]>>({
  key: 'users:list',
  sourceFn: async () => fetchUsers(),
  ttl: 300000
});
```

## Implementation Order

1. **Phase 1**: Update type definitions and interfaces
2. **Phase 2**: Implement core serialization system  
3. **Phase 3**: Update CacheStore with generic support
4. **Phase 4**: Update RunCache facade with backward compatibility
5. **Phase 5**: Add enhanced type safety features
6. **Phase 6**: Comprehensive testing
7. **Phase 7**: Documentation and examples

## Migration Timeline

- **Week 1-2**: Core type system and serialization
- **Week 3**: CacheStore implementation
- **Week 4**: RunCache facade and compatibility layer
- **Week 5**: Enhanced features and validation
- **Week 6**: Testing and bug fixes
- **Week 7**: Documentation and examples

## Risk Mitigation

1. **Breaking Changes**: Maintain strict backward compatibility
2. **Performance**: Benchmark serialization overhead
3. **Type Safety**: Provide runtime validation options
4. **Complexity**: Keep API simple with sensible defaults
5. **Storage**: Ensure existing storage data remains compatible

This plan maintains the library's simplicity while adding powerful type safety features that scale from basic usage to complex enterprise scenarios.