import {
  TypeValidator,
  SchemaValidator,
  UnionValidator,
  ArrayValidator,
  ObjectValidator,
  OptionalValidator,
  StringValidator,
  NumberValidator,
  BooleanValidator,
  NullValidator,
  UndefinedValidator,
  DateValidator,
  PlainObjectValidator,
  AnyArrayValidator,
  ValidatorUtils,
  TypeValidationError,
} from './type-validation';

describe('TypeValidator System', () => {
  describe('SchemaValidator', () => {
    it('should validate values using a predicate function', () => {
      const validator = new SchemaValidator(
        (value): value is string => typeof value === 'string',
        'string',
      );

      expect(validator.validate('hello')).toBe(true);
      expect(validator.validate(123)).toBe(false);
      expect(validator.validate(null)).toBe(false);
      expect(validator.name).toBe('string');
    });

    it('should work with complex type predicates', () => {
      interface User {
        id: number;
        name: string;
      }

      const userValidator = new SchemaValidator(
        (value): value is User => typeof value === 'object'
          && value !== null
          && typeof value.id === 'number'
          && typeof value.name === 'string',
        'User',
      );

      expect(userValidator.validate({ id: 1, name: 'John' })).toBe(true);
      expect(userValidator.validate({ id: 1 })).toBe(false);
      expect(userValidator.validate({ name: 'John' })).toBe(false);
      expect(userValidator.validate('not a user')).toBe(false);
    });
  });

  describe('Built-in Validators', () => {
    describe('StringValidator', () => {
      it('should validate string values', () => {
        expect(StringValidator.validate('hello')).toBe(true);
        expect(StringValidator.validate('')).toBe(true);
        expect(StringValidator.validate(123)).toBe(false);
        expect(StringValidator.validate(null)).toBe(false);
        expect(StringValidator.name).toBe('string');
      });
    });

    describe('NumberValidator', () => {
      it('should validate number values', () => {
        expect(NumberValidator.validate(123)).toBe(true);
        expect(NumberValidator.validate(0)).toBe(true);
        expect(NumberValidator.validate(-42)).toBe(true);
        expect(NumberValidator.validate(3.14)).toBe(true);
        expect(NumberValidator.validate('123')).toBe(false);
        expect(NumberValidator.validate(Number.NaN)).toBe(false);
        expect(NumberValidator.name).toBe('number');
      });
    });

    describe('BooleanValidator', () => {
      it('should validate boolean values', () => {
        expect(BooleanValidator.validate(true)).toBe(true);
        expect(BooleanValidator.validate(false)).toBe(true);
        expect(BooleanValidator.validate(0)).toBe(false);
        expect(BooleanValidator.validate('true')).toBe(false);
        expect(BooleanValidator.name).toBe('boolean');
      });
    });

    describe('NullValidator', () => {
      it('should validate null values', () => {
        expect(NullValidator.validate(null)).toBe(true);
        expect(NullValidator.validate(undefined)).toBe(false);
        expect(NullValidator.validate(0)).toBe(false);
        expect(NullValidator.validate('')).toBe(false);
        expect(NullValidator.name).toBe('null');
      });
    });

    describe('UndefinedValidator', () => {
      it('should validate undefined values', () => {
        expect(UndefinedValidator.validate(undefined)).toBe(true);
        expect(UndefinedValidator.validate(null)).toBe(false);
        expect(UndefinedValidator.validate(0)).toBe(false);
        expect(UndefinedValidator.validate('')).toBe(false);
        expect(UndefinedValidator.name).toBe('undefined');
      });
    });

    describe('DateValidator', () => {
      it('should validate Date objects', () => {
        expect(DateValidator.validate(new Date())).toBe(true);
        expect(DateValidator.validate(new Date('2023-01-01'))).toBe(true);
        expect(DateValidator.validate(new Date('invalid'))).toBe(false);
        expect(DateValidator.validate('2023-01-01')).toBe(false);
        expect(DateValidator.validate(1672531200000)).toBe(false);
        expect(DateValidator.name).toBe('Date');
      });
    });

    describe('PlainObjectValidator', () => {
      it('should validate plain objects', () => {
        expect(PlainObjectValidator.validate({})).toBe(true);
        expect(PlainObjectValidator.validate({ key: 'value' })).toBe(true);
        expect(PlainObjectValidator.validate([])).toBe(false);
        expect(PlainObjectValidator.validate(null)).toBe(false);
        expect(PlainObjectValidator.validate(new Date())).toBe(true); // Date is an object
        expect(PlainObjectValidator.validate('string')).toBe(false);
        expect(PlainObjectValidator.name).toBe('object');
      });
    });

    describe('AnyArrayValidator', () => {
      it('should validate arrays', () => {
        expect(AnyArrayValidator.validate([])).toBe(true);
        expect(AnyArrayValidator.validate([1, 2, 3])).toBe(true);
        expect(AnyArrayValidator.validate(['a', 'b'])).toBe(true);
        expect(AnyArrayValidator.validate({})).toBe(false);
        expect(AnyArrayValidator.validate(null)).toBe(false);
        expect(AnyArrayValidator.name).toBe('Array');
      });
    });
  });

  describe('UnionValidator', () => {
    it('should validate values against multiple validators', () => {
      const stringOrNumberValidator = new UnionValidator([
        StringValidator,
        NumberValidator,
      ]);

      expect(stringOrNumberValidator.validate('hello')).toBe(true);
      expect(stringOrNumberValidator.validate(123)).toBe(true);
      expect(stringOrNumberValidator.validate(true)).toBe(false);
      expect(stringOrNumberValidator.validate(null)).toBe(false);
      expect(stringOrNumberValidator.name).toBe('Union<string | number>');
    });

    it('should work with custom name', () => {
      const validator = new UnionValidator(
        [StringValidator, NumberValidator],
        'StringOrNumber',
      );
      expect(validator.name).toBe('StringOrNumber');
    });
  });

  describe('ArrayValidator', () => {
    it('should validate arrays with element validation', () => {
      const stringArrayValidator = new ArrayValidator(StringValidator);

      expect(stringArrayValidator.validate(['a', 'b', 'c'])).toBe(true);
      expect(stringArrayValidator.validate([])).toBe(true);
      expect(stringArrayValidator.validate(['a', 123])).toBe(false);
      expect(stringArrayValidator.validate('not an array')).toBe(false);
      expect(stringArrayValidator.name).toBe('Array<string>');
    });

    it('should work with complex element validators', () => {
      const numberArrayValidator = new ArrayValidator(NumberValidator);

      expect(numberArrayValidator.validate([1, 2, 3])).toBe(true);
      expect(numberArrayValidator.validate([1, 'two'])).toBe(false);
      expect(numberArrayValidator.name).toBe('Array<number>');
    });
  });

  describe('ObjectValidator', () => {
    it('should validate objects with property validation', () => {
      interface User {
        id: number;
        name: string;
        active: boolean;
      }

      const userValidator = new ObjectValidator<User>({
        id: NumberValidator,
        name: StringValidator,
        active: BooleanValidator,
      });

      expect(userValidator.validate({
        id: 1,
        name: 'John',
        active: true,
      })).toBe(true);

      expect(userValidator.validate({
        id: 1,
        name: 'John',
        active: 'yes',
      })).toBe(false);

      expect(userValidator.validate({
        id: 1,
        name: 'John',
        // missing active property
      })).toBe(false);

      expect(userValidator.validate('not an object')).toBe(false);
      expect(userValidator.validate(null)).toBe(false);
      expect(userValidator.validate([])).toBe(false);
    });

    it('should work with custom name', () => {
      const validator = new ObjectValidator(
        { id: NumberValidator },
        'CustomObject',
      );
      expect(validator.name).toBe('CustomObject');
    });
  });

  describe('OptionalValidator', () => {
    it('should validate optional values', () => {
      const optionalStringValidator = new OptionalValidator(StringValidator);

      expect(optionalStringValidator.validate('hello')).toBe(true);
      expect(optionalStringValidator.validate(undefined)).toBe(true);
      expect(optionalStringValidator.validate(123)).toBe(false);
      expect(optionalStringValidator.validate(null)).toBe(false);
      expect(optionalStringValidator.name).toBe('string | undefined');
    });
  });

  describe('ValidatorUtils', () => {
    describe('literal', () => {
      it('should validate literal values', () => {
        const fooValidator = ValidatorUtils.literal('foo');
        const trueValidator = ValidatorUtils.literal(true);
        const zeroValidator = ValidatorUtils.literal(0);

        expect(fooValidator.validate('foo')).toBe(true);
        expect(fooValidator.validate('bar')).toBe(false);
        expect(fooValidator.name).toBe('"foo"');

        expect(trueValidator.validate(true)).toBe(true);
        expect(trueValidator.validate(false)).toBe(false);
        expect(trueValidator.name).toBe('"true"');

        expect(zeroValidator.validate(0)).toBe(true);
        expect(zeroValidator.validate(1)).toBe(false);
        expect(zeroValidator.name).toBe('"0"');
      });
    });

    describe('stringEnum', () => {
      it('should validate string enum values', () => {
        const colorValidator = ValidatorUtils.stringEnum('red', 'green', 'blue');

        expect(colorValidator.validate('red')).toBe(true);
        expect(colorValidator.validate('green')).toBe(true);
        expect(colorValidator.validate('blue')).toBe(true);
        expect(colorValidator.validate('yellow')).toBe(false);
        expect(colorValidator.validate(123)).toBe(false);
        expect(colorValidator.name).toBe('"red" | "green" | "blue"');
      });
    });

    describe('numberEnum', () => {
      it('should validate number enum values', () => {
        const statusValidator = ValidatorUtils.numberEnum(200, 404, 500);

        expect(statusValidator.validate(200)).toBe(true);
        expect(statusValidator.validate(404)).toBe(true);
        expect(statusValidator.validate(500)).toBe(true);
        expect(statusValidator.validate(201)).toBe(false);
        expect(statusValidator.validate('200')).toBe(false);
        expect(statusValidator.name).toBe('200 | 404 | 500');
      });
    });

    describe('optional', () => {
      it('should create optional validators', () => {
        const optionalNumber = ValidatorUtils.optional(NumberValidator);

        expect(optionalNumber.validate(123)).toBe(true);
        expect(optionalNumber.validate(undefined)).toBe(true);
        expect(optionalNumber.validate('123')).toBe(false);
        expect(optionalNumber.name).toBe('number | undefined');
      });
    });

    describe('union', () => {
      it('should create union validators', () => {
        const stringOrNumber = ValidatorUtils.union(StringValidator, NumberValidator);

        expect(stringOrNumber.validate('hello')).toBe(true);
        expect(stringOrNumber.validate(123)).toBe(true);
        expect(stringOrNumber.validate(true)).toBe(false);
        expect(stringOrNumber.name).toBe('Union<string | number>');
      });
    });

    describe('array', () => {
      it('should create array validators', () => {
        const stringArray = ValidatorUtils.array(StringValidator);

        expect(stringArray.validate(['a', 'b'])).toBe(true);
        expect(stringArray.validate([])).toBe(true);
        expect(stringArray.validate(['a', 123])).toBe(false);
        expect(stringArray.name).toBe('Array<string>');
      });
    });

    describe('object', () => {
      it('should create object validators', () => {
        interface Person {
          name: string;
          age: number;
        }

        const personValidator = ValidatorUtils.object<Person>({
          name: StringValidator,
          age: NumberValidator,
        }, 'Person');

        expect(personValidator.validate({ name: 'John', age: 30 })).toBe(true);
        expect(personValidator.validate({ name: 'John' })).toBe(false);
        expect(personValidator.name).toBe('Person');
      });
    });
  });

  describe('Complex validation scenarios', () => {
    it('should handle nested object validation', () => {
      interface Address {
        street: string;
        city: string;
        zipCode: string;
      }

      interface User {
        id: number;
        name: string;
        address: Address;
        tags: string[];
      }

      const addressValidator = ValidatorUtils.object<Address>({
        street: StringValidator,
        city: StringValidator,
        zipCode: StringValidator,
      }, 'Address');

      const userValidator = ValidatorUtils.object<User>({
        id: NumberValidator,
        name: StringValidator,
        address: addressValidator,
        tags: ValidatorUtils.array(StringValidator),
      }, 'User');

      const validUser = {
        id: 1,
        name: 'John Doe',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          zipCode: '12345',
        },
        tags: ['admin', 'active'],
      };

      expect(userValidator.validate(validUser)).toBe(true);

      const invalidUser = {
        id: 1,
        name: 'John Doe',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          // missing zipCode
        },
        tags: ['admin', 'active'],
      };

      expect(userValidator.validate(invalidUser)).toBe(false);
    });

    it('should handle optional properties', () => {
      interface Config {
        host: string;
        port: number;
        ssl?: boolean;
      }

      const configValidator = ValidatorUtils.object<Config>({
        host: StringValidator,
        port: NumberValidator,
        ssl: ValidatorUtils.optional(BooleanValidator),
      });

      expect(configValidator.validate({
        host: 'localhost',
        port: 3000,
        ssl: true,
      })).toBe(true);

      expect(configValidator.validate({
        host: 'localhost',
        port: 3000,
      })).toBe(true);

      expect(configValidator.validate({
        host: 'localhost',
        port: 3000,
        ssl: 'yes',
      })).toBe(false);
    });
  });

  describe('TypeValidationError', () => {
    it('should create error with proper message', () => {
      const error = new TypeValidationError('string', 123);
      expect(error.message).toBe('Expected string, but received number');
      expect(error.name).toBe('TypeValidationError');
      expect(error.expectedType).toBe('string');
      expect(error.actualValue).toBe(123);
      expect(error.key).toBeUndefined();
    });

    it('should include key in error message when provided', () => {
      const error = new TypeValidationError('number', 'invalid', 'userId');
      expect(error.message).toBe('Key "userId": Expected number, but received string');
      expect(error.key).toBe('userId');
    });
  });

  describe('Performance and edge cases', () => {
    it('should handle deeply nested structures', () => {
      const deepValidator = ValidatorUtils.array(
        ValidatorUtils.array(
          ValidatorUtils.array(StringValidator),
        ),
      );

      expect(deepValidator.validate([[['a', 'b'], ['c']], [['d']]])).toBe(true);
      expect(deepValidator.validate([[['a', 'b'], ['c']], [['d', 123]]])).toBe(false);
    });

    it('should handle circular references in validation logic', () => {
      // This tests that validators don't get stuck in infinite loops
      const circularObject = { value: 'test' };
      (circularObject as any).self = circularObject;

      const validator = ValidatorUtils.object({
        value: StringValidator,
      });

      // Should validate the known properties and ignore the circular reference
      expect(validator.validate(circularObject)).toBe(true);
    });

    it('should handle large arrays efficiently', () => {
      const largeArray = new Array(10000).fill('test');
      const stringArrayValidator = ValidatorUtils.array(StringValidator);

      const start = Date.now();
      expect(stringArrayValidator.validate(largeArray)).toBe(true);
      const end = Date.now();

      // Validation should complete within reasonable time (< 100ms)
      expect(end - start).toBeLessThan(100);
    });
  });
});
