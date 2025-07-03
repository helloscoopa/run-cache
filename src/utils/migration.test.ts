import { CacheMigrationUtils } from './migration';

describe('CacheMigrationUtils', () => {
  describe('detectValueType', () => {
    it('should detect string values', () => {
      expect(CacheMigrationUtils.detectValueType('plain string')).toBe('string');
      expect(CacheMigrationUtils.detectValueType('hello world')).toBe('string');
      expect(CacheMigrationUtils.detectValueType('123abc')).toBe('string');
    });

    it('should detect object values', () => {
      expect(CacheMigrationUtils.detectValueType('{"key": "value"}')).toBe('object');
      expect(CacheMigrationUtils.detectValueType('{"name": "John", "age": 30}')).toBe('object');
      expect(CacheMigrationUtils.detectValueType('{"nested": {"value": true}}')).toBe('object');
    });

    it('should detect array values', () => {
      expect(CacheMigrationUtils.detectValueType('[]')).toBe('array');
      expect(CacheMigrationUtils.detectValueType('[1, 2, 3]')).toBe('array');
      expect(CacheMigrationUtils.detectValueType('["a", "b", "c"]')).toBe('array');
    });

    it('should detect primitive values', () => {
      expect(CacheMigrationUtils.detectValueType('123')).toBe('primitive');
      expect(CacheMigrationUtils.detectValueType('true')).toBe('primitive');
      expect(CacheMigrationUtils.detectValueType('false')).toBe('primitive');
      expect(CacheMigrationUtils.detectValueType('null')).toBe('primitive');
      expect(CacheMigrationUtils.detectValueType('3.14')).toBe('primitive');
    });

    it('should handle malformed JSON as strings', () => {
      expect(CacheMigrationUtils.detectValueType('{"invalid": json}')).toBe('string');
      expect(CacheMigrationUtils.detectValueType('[invalid array')).toBe('string');
    });
  });

  describe('migrateStringCacheToTyped', () => {
    it('should migrate plain strings', () => {
      const result = CacheMigrationUtils.migrateStringCacheToTyped<string>('hello world');
      expect(result).toBe('hello world');
    });

    it('should migrate JSON objects', () => {
      const input = '{"name": "John", "age": 30}';
      const result = CacheMigrationUtils.migrateStringCacheToTyped<{name: string; age: number}>(input);
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('should migrate JSON arrays', () => {
      const input = '[1, 2, 3, 4]';
      const result = CacheMigrationUtils.migrateStringCacheToTyped<number[]>(input);
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('should migrate primitive values', () => {
      expect(CacheMigrationUtils.migrateStringCacheToTyped<number>('123')).toBe(123);
      expect(CacheMigrationUtils.migrateStringCacheToTyped<boolean>('true')).toBe(true);
      expect(CacheMigrationUtils.migrateStringCacheToTyped<boolean>('false')).toBe(false);
      expect(CacheMigrationUtils.migrateStringCacheToTyped<null>('null')).toBe(null);
    });

    it('should handle constructor function', () => {
      class TestClass {
        public data: any;

        constructor(data: any) {
          this.data = data;
        }
      }

      const input = '{"value": "test"}';
      const result = CacheMigrationUtils.migrateStringCacheToTyped(input, TestClass);
      expect(result).toBeInstanceOf(TestClass);
      expect(result.data).toEqual({ value: 'test' });
    });

    it('should handle malformed JSON gracefully', () => {
      const input = '{"invalid": json}';
      const result = CacheMigrationUtils.migrateStringCacheToTyped<string>(input);
      expect(result).toBe(input);
    });
  });

  describe('inferTypeHint', () => {
    it('should infer basic types', () => {
      expect(CacheMigrationUtils.inferTypeHint('string')).toBe('string');
      expect(CacheMigrationUtils.inferTypeHint(123)).toBe('number');
      expect(CacheMigrationUtils.inferTypeHint(true)).toBe('boolean');
      expect(CacheMigrationUtils.inferTypeHint(null)).toBe('null');
    });

    it('should detect arrays', () => {
      expect(CacheMigrationUtils.inferTypeHint([1, 2, 3])).toBe('array');
      expect(CacheMigrationUtils.inferTypeHint(['a', 'b'])).toBe('array');
    });

    it('should detect objects and their constructors', () => {
      expect(CacheMigrationUtils.inferTypeHint({})).toBe('Object');
      expect(CacheMigrationUtils.inferTypeHint(new Date())).toBe('Date');

      class CustomClass {}
      expect(CacheMigrationUtils.inferTypeHint(new CustomClass())).toBe('CustomClass');
    });
  });

  describe('needsMigration', () => {
    it('should return false for non-string values', () => {
      expect(CacheMigrationUtils.needsMigration(123)).toBe(false);
      expect(CacheMigrationUtils.needsMigration({})).toBe(false);
      expect(CacheMigrationUtils.needsMigration([])).toBe(false);
      expect(CacheMigrationUtils.needsMigration(true)).toBe(false);
    });

    it('should return false for strings with type metadata', () => {
      const withMetadata = '{"__type__": "User", "data": {"name": "John"}}';
      expect(CacheMigrationUtils.needsMigration(withMetadata)).toBe(false);
    });

    it('should return true for plain strings', () => {
      expect(CacheMigrationUtils.needsMigration('plain string')).toBe(true);
      expect(CacheMigrationUtils.needsMigration('hello world')).toBe(true);
    });

    it('should return true for JSON without type metadata', () => {
      expect(CacheMigrationUtils.needsMigration('{"name": "John"}')).toBe(true);
      expect(CacheMigrationUtils.needsMigration('[1, 2, 3]')).toBe(true);
      expect(CacheMigrationUtils.needsMigration('123')).toBe(true);
    });

    it('should handle malformed JSON', () => {
      expect(CacheMigrationUtils.needsMigration('{"invalid": json}')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings', () => {
      expect(CacheMigrationUtils.detectValueType('')).toBe('string');
      expect(CacheMigrationUtils.migrateStringCacheToTyped<string>('')).toBe('');
      expect(CacheMigrationUtils.needsMigration('')).toBe(true);
    });

    it('should handle whitespace-only strings', () => {
      expect(CacheMigrationUtils.detectValueType('   ')).toBe('string');
      expect(CacheMigrationUtils.migrateStringCacheToTyped<string>('   ')).toBe('   ');
    });

    it('should handle strings that look like JSON but are not', () => {
      const notJson = 'this { is not } json';
      expect(CacheMigrationUtils.detectValueType(notJson)).toBe('string');
      expect(CacheMigrationUtils.migrateStringCacheToTyped<string>(notJson)).toBe(notJson);
    });
  });
});
