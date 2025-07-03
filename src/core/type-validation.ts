/**
 * Runtime type validation system for RunCache
 */

/**
 * Interface for type validators that can validate values at runtime
 */
export interface TypeValidator<T> {
  /**
   * Validates if a value matches the expected type
   * @param value The value to validate
   * @returns True if the value is of type T, false otherwise
   */
  validate(value: any): value is T;

  /**
   * Human-readable name for this validator
   */
  name: string;
}

/**
 * Schema-based validator that uses a predicate function to validate types
 */
export class SchemaValidator<T> implements TypeValidator<T> {
  public name: string;

  private schema: (value: any) => value is T;

  constructor(
    schema: (value: any) => value is T,
    name: string,
  ) {
    this.schema = schema;
    this.name = name;
  }

  validate(value: any): value is T {
    return this.schema(value);
  }
}

/**
 * Composite validator that checks if a value matches any of the provided validators
 */
export class UnionValidator<T> implements TypeValidator<T> {
  public name: string;

  constructor(
    private validators: TypeValidator<any>[],
    name?: string,
  ) {
    this.name = name || `Union<${validators.map((v) => v.name).join(' | ')}>`;
  }

  validate(value: any): value is T {
    return this.validators.some((validator) => validator.validate(value));
  }
}

/**
 * Validator for array types with element validation
 */
export class ArrayValidator<T> implements TypeValidator<T[]> {
  public name: string;

  constructor(
    private elementValidator: TypeValidator<T>,
    name?: string,
  ) {
    this.name = name || `Array<${elementValidator.name}>`;
  }

  validate(value: any): value is T[] {
    if (!Array.isArray(value)) {
      return false;
    }

    return value.every((item) => this.elementValidator.validate(item));
  }
}

/**
 * Validator for object types with property validation
 */
export class ObjectValidator<T extends Record<string, any>> implements TypeValidator<T> {
  public name: string;

  constructor(
    private schema: { [K in keyof T]: TypeValidator<T[K]> },
    name?: string,
  ) {
    this.name = name || 'Object';
  }

  validate(value: any): value is T {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    // Check that all required properties exist and are valid
    for (const [key, validator] of Object.entries(this.schema)) {
      const hasProperty = key in value;
      const propertyValue = value[key];

      // If property is missing, check if validator accepts undefined
      if (!hasProperty) {
        if (!validator.validate(undefined)) {
          return false; // Required property is missing
        }
        continue;
      }

      // Property exists, validate its value
      if (!validator.validate(propertyValue)) {
        return false;
      }
    }

    return true;
  }
}

/**
 * Optional validator that allows undefined values
 */
export class OptionalValidator<T> implements TypeValidator<T | undefined> {
  public name: string;

  constructor(
    private innerValidator: TypeValidator<T>,
    name?: string,
  ) {
    this.name = name || `${innerValidator.name} | undefined`;
  }

  validate(value: any): value is T | undefined {
    return value === undefined || this.innerValidator.validate(value);
  }
}

// Built-in primitive validators

/**
 * Validator for string types
 */
export const StringValidator = new SchemaValidator(
  (value): value is string => typeof value === 'string',
  'string',
);

/**
 * Validator for number types
 */
export const NumberValidator = new SchemaValidator(
  (value): value is number => typeof value === 'number' && !Number.isNaN(value),
  'number',
);

/**
 * Validator for boolean types
 */
export const BooleanValidator = new SchemaValidator(
  (value): value is boolean => typeof value === 'boolean',
  'boolean',
);

/**
 * Validator for null values
 */
export const NullValidator = new SchemaValidator(
  (value): value is null => value === null,
  'null',
);

/**
 * Validator for undefined values
 */
export const UndefinedValidator = new SchemaValidator(
  (value): value is undefined => value === undefined,
  'undefined',
);

/**
 * Validator for Date objects
 */
export const DateValidator = new SchemaValidator(
  (value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()),
  'Date',
);

/**
 * Validator for plain objects (not arrays or null)
 */
export const PlainObjectValidator = new SchemaValidator(
  (value): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value),
  'object',
);

/**
 * Validator for any array
 */
export const AnyArrayValidator = new SchemaValidator(
  (value): value is any[] => Array.isArray(value),
  'Array',
);

/**
 * Utility functions for creating common validators
 */
export class ValidatorUtils {
  /**
   * Creates a validator for a literal value
   */
  static literal<T extends string | number | boolean>(literalValue: T): TypeValidator<T> {
    return new SchemaValidator(
      (value): value is T => value === literalValue,
      `"${literalValue}"`,
    );
  }

  /**
   * Creates a validator for string enums
   */
  static stringEnum<T extends string>(...values: T[]): TypeValidator<T> {
    return new SchemaValidator(
      (value): value is T => typeof value === 'string' && values.includes(value as T),
      `"${values.join('" | "')}"`,
    );
  }

  /**
   * Creates a validator for number enums
   */
  static numberEnum<T extends number>(...values: T[]): TypeValidator<T> {
    return new SchemaValidator(
      (value): value is T => typeof value === 'number' && values.includes(value as T),
      values.join(' | '),
    );
  }

  /**
   * Creates an optional version of any validator
   */
  static optional<T>(validator: TypeValidator<T>): TypeValidator<T | undefined> {
    return new OptionalValidator(validator);
  }

  /**
   * Creates a union validator from multiple validators
   */
  static union<T>(...validators: TypeValidator<any>[]): TypeValidator<T> {
    return new UnionValidator<T>(validators);
  }

  /**
   * Creates an array validator with element validation
   */
  static array<T>(elementValidator: TypeValidator<T>): TypeValidator<T[]> {
    return new ArrayValidator(elementValidator);
  }

  /**
   * Creates an object validator with property validation
   */
  static object<T extends Record<string, any>>(
    schema: { [K in keyof T]: TypeValidator<T[K]> },
    name?: string,
  ): TypeValidator<T> {
    return new ObjectValidator(schema, name);
  }
}

/**
 * Type validation error class
 */
export class TypeValidationError extends Error {
  constructor(
    public readonly expectedType: string,
    public readonly actualValue: any,
    public readonly key?: string,
  ) {
    const keyPrefix = key ? `Key "${key}": ` : '';
    super(`${keyPrefix}Expected ${expectedType}, but received ${typeof actualValue}`);
    this.name = 'TypeValidationError';
  }
}
