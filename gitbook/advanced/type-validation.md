# Type Validation

RunCache provides a comprehensive type validation system that allows you to enforce data integrity through runtime type checking. This ensures that cached values match expected types and schemas.

## Overview

The type validation system includes:

- **Built-in Validators**: Common primitive and complex type validators
- **Schema Validation**: Object structure and property type validation
- **Custom Validators**: Create validators for your specific types
- **Runtime Checking**: Validate data on cache operations
- **Type Guards**: TypeScript type narrowing support

## Basic Validators

### Primitive Type Validators

```typescript
import { 
  StringValidator, 
  NumberValidator, 
  BooleanValidator,
  ArrayValidator 
} from 'run-cache';

// Validate primitive types
console.log(StringValidator.validate('hello')); // true
console.log(StringValidator.validate(123)); // false

console.log(NumberValidator.validate(42)); // true
console.log(NumberValidator.validate('42')); // false

console.log(BooleanValidator.validate(true)); // true
console.log(BooleanValidator.validate(1)); // false

console.log(ArrayValidator.validate([1, 2, 3])); // true
console.log(ArrayValidator.validate('not array')); // false
```

### Date and Special Type Validators

```typescript
import { DateValidator, RegExpValidator } from 'run-cache';

console.log(DateValidator.validate(new Date())); // true
console.log(DateValidator.validate('2023-12-25')); // false

console.log(RegExpValidator.validate(/pattern/g)); // true
console.log(RegExpValidator.validate('pattern')); // false
```

## Schema Validation

### Object Schema Validation

Create complex validators for object structures:

```typescript
import { ValidatorUtils, SchemaValidator } from 'run-cache';

interface User {
  id: number;
  name: string;
  email: string;
  age?: number;
  active: boolean;
}

// Create a schema validator for User
const userValidator = ValidatorUtils.object({
  id: NumberValidator,
  name: StringValidator,
  email: ValidatorUtils.string(email => email.includes('@')), // Custom string validator
  age: ValidatorUtils.optional(NumberValidator), // Optional property
  active: BooleanValidator
});

// Test validation
const validUser = {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  active: true
};

const invalidUser = {
  id: '1', // Wrong type (string instead of number)
  name: 'John Doe',
  email: 'invalid-email', // Invalid email format
  active: true
  // Missing required fields
};

console.log(userValidator.validate(validUser)); // true
console.log(userValidator.validate(invalidUser)); // false
```

### Nested Object Validation

Validate complex nested structures:

```typescript
interface Address {
  street: string;
  city: string;
  zipCode: string;
  country: string;
}

interface UserProfile {
  user: User;
  address: Address;
  preferences: {
    theme: 'light' | 'dark';
    notifications: boolean;
    language: string;
  };
}

const addressValidator = ValidatorUtils.object({
  street: StringValidator,
  city: StringValidator,
  zipCode: ValidatorUtils.string(zip => /^\d{5}(-\d{4})?$/.test(zip)),
  country: StringValidator
});

const preferencesValidator = ValidatorUtils.object({
  theme: ValidatorUtils.union(['light', 'dark']),
  notifications: BooleanValidator,
  language: ValidatorUtils.string(lang => lang.length === 2)
});

const userProfileValidator = ValidatorUtils.object({
  user: userValidator,
  address: addressValidator,
  preferences: preferencesValidator
});

// Use with caching
await RunCache.set({
  key: 'profile:123',
  value: userProfile,
  validator: userProfileValidator
});
```

### Array Validation

Validate arrays and their contents:

```typescript
// Array of specific type
const numberArrayValidator = ValidatorUtils.array(NumberValidator);
const userArrayValidator = ValidatorUtils.array(userValidator);

console.log(numberArrayValidator.validate([1, 2, 3])); // true
console.log(numberArrayValidator.validate([1, '2', 3])); // false

// Mixed array validation
const mixedArrayValidator = ValidatorUtils.array(
  ValidatorUtils.union([StringValidator, NumberValidator])
);

console.log(mixedArrayValidator.validate(['hello', 123, 'world'])); // true
console.log(mixedArrayValidator.validate(['hello', true])); // false
```

## Union and Conditional Types

### Union Type Validation

```typescript
// Union of primitive types
type Status = 'pending' | 'approved' | 'rejected';
const statusValidator = ValidatorUtils.union(['pending', 'approved', 'rejected']);

// Union of complex types
interface SuccessResponse {
  success: true;
  data: any;
}

interface ErrorResponse {
  success: false;
  error: string;
}

type ApiResponse = SuccessResponse | ErrorResponse;

const successValidator = ValidatorUtils.object({
  success: ValidatorUtils.literal(true),
  data: ValidatorUtils.any()
});

const errorValidator = ValidatorUtils.object({
  success: ValidatorUtils.literal(false),
  error: StringValidator
});

const apiResponseValidator = ValidatorUtils.union([successValidator, errorValidator]);

// Test union validation
const successResponse: SuccessResponse = { success: true, data: { users: [] } };
const errorResponse: ErrorResponse = { success: false, error: 'Not found' };

console.log(apiResponseValidator.validate(successResponse)); // true
console.log(apiResponseValidator.validate(errorResponse)); // true
console.log(apiResponseValidator.validate({ success: true })); // false (missing data)
```

### Conditional Validation

Create validators that depend on other properties:

```typescript
const conditionalValidator = new SchemaValidator<any>(
  (value): value is any => {
    if (!value || typeof value !== 'object') return false;
    
    // If type is 'user', require name and email
    if (value.type === 'user') {
      return typeof value.name === 'string' && 
             typeof value.email === 'string' &&
             value.email.includes('@');
    }
    
    // If type is 'product', require name and price
    if (value.type === 'product') {
      return typeof value.name === 'string' && 
             typeof value.price === 'number' &&
             value.price > 0;
    }
    
    return false;
  },
  'ConditionalEntity'
);

// Test conditional validation
console.log(conditionalValidator.validate({
  type: 'user',
  name: 'John',
  email: 'john@example.com'
})); // true

console.log(conditionalValidator.validate({
  type: 'product',
  name: 'Laptop',
  price: 999.99
})); // true

console.log(conditionalValidator.validate({
  type: 'user',
  name: 'John'
  // Missing email
})); // false
```

## Custom Validators

### Creating Custom Validators

```typescript
import { TypeValidator, SchemaValidator } from 'run-cache';

// Custom validator for email addresses
const emailValidator = new SchemaValidator<string>(
  (value): value is string => {
    return typeof value === 'string' && 
           /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  },
  'Email'
);

// Custom validator for positive numbers
const positiveNumberValidator = new SchemaValidator<number>(
  (value): value is number => {
    return typeof value === 'number' && value > 0;
  },
  'PositiveNumber'
);

// Custom validator for non-empty arrays
function createNonEmptyArrayValidator<T>(itemValidator: TypeValidator<T>): TypeValidator<T[]> {
  return new SchemaValidator<T[]>(
    (value): value is T[] => {
      return Array.isArray(value) && 
             value.length > 0 && 
             value.every(item => itemValidator.validate(item));
    },
    `NonEmptyArray<${itemValidator.name}>`
  );
}

const nonEmptyStringArrayValidator = createNonEmptyArrayValidator(StringValidator);
```

### Generic Validators

Create reusable validators for generic types:

```typescript
// Generic API response validator
function createApiResponseValidator<T>(dataValidator: TypeValidator<T>): TypeValidator<{
  success: boolean;
  data: T;
  message: string;
}> {
  return ValidatorUtils.object({
    success: BooleanValidator,
    data: dataValidator,
    message: StringValidator
  });
}

// Usage
const userApiResponseValidator = createApiResponseValidator(userValidator);
const productApiResponseValidator = createApiResponseValidator(
  ValidatorUtils.array(ValidatorUtils.object({
    id: NumberValidator,
    name: StringValidator,
    price: positiveNumberValidator
  }))
);
```

## Integration with Caching

### Validation on Set Operations

```typescript
// Configure cache with validation
await RunCache.set({
  key: 'user:123',
  value: userData,
  validator: userValidator,
  validateOnSet: true // Validate before caching
});

// This will throw an error if userData doesn't match the schema
```

### Validation on Get Operations

```typescript
// Configure global validation
RunCache.configure({
  validateOnGet: true,
  validationFailureAction: 'warn' // 'throw', 'warn', or 'ignore'
});

// Validate when retrieving from cache
const user = await RunCache.get('user:123');
// If cached data is invalid, action depends on validationFailureAction setting
```

### Type-Safe Cache Operations

```typescript
// Create a typed cache with validation
class ValidatedCache<T> {
  constructor(
    private prefix: string,
    private validator: TypeValidator<T>
  ) {}

  async set(id: string, value: T): Promise<void> {
    if (!this.validator.validate(value)) {
      throw new Error(`Invalid ${this.validator.name}: ${JSON.stringify(value)}`);
    }
    
    await RunCache.set({
      key: `${this.prefix}:${id}`,
      value,
      validator: this.validator
    });
  }

  async get(id: string): Promise<T | undefined> {
    const value = await RunCache.get(`${this.prefix}:${id}`);
    
    if (value !== undefined && !this.validator.validate(value)) {
      console.warn(`Cached ${this.validator.name} failed validation:`, value);
      return undefined;
    }
    
    return value as T;
  }
}

// Usage
const userCache = new ValidatedCache('users', userValidator);
const productCache = new ValidatedCache('products', productValidator);

await userCache.set('123', validUser);
const retrievedUser = await userCache.get('123'); // Guaranteed to be valid or undefined
```

## Advanced Validation Patterns

### Transformation Validators

Validators that can transform data during validation:

```typescript
class TransformingValidator<TInput, TOutput> implements TypeValidator<TOutput> {
  constructor(
    public name: string,
    private transformFn: (input: TInput) => TOutput | null,
    private baseValidator: TypeValidator<TInput>
  ) {}

  validate(value: any): value is TOutput {
    if (!this.baseValidator.validate(value)) {
      return false;
    }
    
    const transformed = this.transformFn(value);
    return transformed !== null;
  }

  apply(value: TInput): TOutput | null {
    return this.transformFn(value);
  }
}

// Example: String to Date transformer
const dateStringValidator = new TransformingValidator<string, Date>(
  'DateString',
  (str: string) => {
    const date = new Date(str);
    return isNaN(date.getTime()) ? null : date;
  },
  StringValidator
);
```

### Async Validators

Validators that perform asynchronous checks:

```typescript
class AsyncValidator<T> {
  constructor(
    public name: string,
    private asyncCheck: (value: T) => Promise<boolean>
  ) {}

  async validate(value: any): Promise<boolean> {
    try {
      return await this.asyncCheck(value);
    } catch (error) {
      console.warn(`Async validation failed for ${this.name}:`, error);
      return false;
    }
  }
}

// Example: Validate user exists in database
const userExistsValidator = new AsyncValidator<{ id: number }>(
  'UserExists',
  async (user) => {
    // Check if user exists in database
    const exists = await checkUserExists(user.id);
    return exists;
  }
);

// Usage with caching
async function setUserWithValidation(user: User) {
  const isValid = await userExistsValidator.validate(user);
  if (!isValid) {
    throw new Error('User does not exist in database');
  }
  
  await RunCache.set({ key: `user:${user.id}`, value: user });
}
```

## Performance Considerations

### Validation Overhead

- Simple validators: < 1ms per validation
- Complex object validators: 1-5ms depending on structure
- Array validators: Linear with array size
- Async validators: Depends on async operation

### Optimization Strategies

```typescript
// Cache validation results for expensive checks
const validationCache = new Map<string, boolean>();

function createCachedValidator<T>(
  baseValidator: TypeValidator<T>,
  keyFn: (value: T) => string
): TypeValidator<T> {
  return new SchemaValidator<T>(
    (value): value is T => {
      const key = keyFn(value);
      
      if (validationCache.has(key)) {
        return validationCache.get(key)!;
      }
      
      const isValid = baseValidator.validate(value);
      validationCache.set(key, isValid);
      return isValid;
    },
    `Cached${baseValidator.name}`
  );
}

// Usage
const cachedUserValidator = createCachedValidator(
  userValidator,
  (user) => `user:${user.id}:${JSON.stringify(user)}`
);
```

### Selective Validation

Only validate when necessary:

```typescript
// Validate only in development or for critical data
const shouldValidate = process.env.NODE_ENV === 'development' || isCriticalData;

if (shouldValidate) {
  if (!validator.validate(data)) {
    throw new Error('Validation failed');
  }
}

await RunCache.set({ key, value: data });
```

## Error Handling and Debugging

### Detailed Validation Errors

```typescript
class DetailedValidator<T> implements TypeValidator<T> {
  constructor(
    public name: string,
    private checks: Array<{
      name: string;
      validate: (value: any) => boolean;
    }>
  ) {}

  validate(value: any): value is T {
    const errors: string[] = [];
    
    for (const check of this.checks) {
      if (!check.validate(value)) {
        errors.push(check.name);
      }
    }
    
    if (errors.length > 0) {
      console.warn(`Validation failed for ${this.name}:`, errors);
      return false;
    }
    
    return true;
  }
}

// Usage
const detailedUserValidator = new DetailedValidator<User>('User', [
  { name: 'has id', validate: (v) => typeof v?.id === 'number' },
  { name: 'has name', validate: (v) => typeof v?.name === 'string' },
  { name: 'has valid email', validate: (v) => typeof v?.email === 'string' && v.email.includes('@') },
  { name: 'has active status', validate: (v) => typeof v?.active === 'boolean' }
]);
```

### Validation Debugging

```typescript
// Debug validation failures
function debugValidation<T>(validator: TypeValidator<T>, value: any): void {
  console.group(`Validating ${validator.name}`);
  console.log('Value:', value);
  console.log('Type:', typeof value);
  console.log('Is Array:', Array.isArray(value));
  console.log('Constructor:', value?.constructor?.name);
  
  const isValid = validator.validate(value);
  console.log('Result:', isValid ? '✅ Valid' : '❌ Invalid');
  
  if (!isValid && typeof value === 'object' && value !== null) {
    console.log('Properties:', Object.keys(value));
    console.log('Property types:', 
      Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, typeof v])
      )
    );
  }
  
  console.groupEnd();
}

// Usage
debugValidation(userValidator, suspiciousUserData);
```

## Best Practices

1. **Start Simple**: Begin with basic validators and gradually add complexity
2. **Compose Validators**: Build complex validators from simpler ones
3. **Cache Results**: Cache expensive validation results when possible
4. **Fail Fast**: Validate early to catch errors quickly
5. **Provide Clear Errors**: Use descriptive validation error messages
6. **Test Validators**: Write tests for your custom validators
7. **Document Schemas**: Document your data structures and validation rules

## Next Steps

- Learn about [Serialization Adapters](serialization-adapters.md) for custom types
- Explore [Best Practices](../guides/best-practices.md) for validation patterns
- See the [API Reference](../api/serialization-system.md) for complete validator interfaces
- Check out [Performance Optimization](../guides/performance.md) for validation performance