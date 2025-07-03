import {
  DateSerializationAdapter,
  MapSerializationAdapter,
  SetSerializationAdapter,
  RegExpSerializationAdapter,
  BigIntSerializationAdapter,
  URLSerializationAdapter,
  ErrorSerializationAdapter,
  BufferSerializationAdapter,
  ClassInstanceSerializationAdapter,
  TypedArraySerializationAdapter,
  CompositeSerializationAdapter,
  createStandardSerializationAdapter,
  createTypedArrayAdapters,
  Person,
  createPersonSerializationAdapter,
} from './serialization-adapters';

describe('Serialization Adapters', () => {
  describe('DateSerializationAdapter', () => {
    const adapter = new DateSerializationAdapter();

    it('should handle Date objects', () => {
      const testDate = new Date('2023-12-25T10:30:00Z');

      expect(adapter.canHandle(testDate)).toBe(true);
      expect(adapter.canHandle('not a date')).toBe(false);
      expect(adapter.canHandle(123)).toBe(false);
    });

    it('should serialize and deserialize dates correctly', () => {
      const testDate = new Date('2023-12-25T10:30:00Z');

      const serialized = adapter.serialize(testDate);
      const deserialized = adapter.deserialize(serialized);

      expect(deserialized).toEqual(testDate);
      expect(deserialized.getTime()).toBe(testDate.getTime());
      expect(deserialized instanceof Date).toBe(true);
    });

    it('should handle invalid serialized data gracefully', () => {
      const invalidData = 'invalid json';
      const result = adapter.deserialize(invalidData);

      expect(result instanceof Date).toBe(true);
      expect(result.toString()).toBe('Invalid Date');
    });
  });

  describe('MapSerializationAdapter', () => {
    const adapter = new MapSerializationAdapter();

    it('should handle Map objects', () => {
      const testMap = new Map([['key', 'value']]);

      expect(adapter.canHandle(testMap)).toBe(true);
      expect(adapter.canHandle({})).toBe(false);
      expect(adapter.canHandle([])).toBe(false);
    });

    it('should serialize and deserialize Maps correctly', () => {
      const testMap = new Map<string, any>([
        ['string', 'value'],
        ['number', 42],
        ['object', { nested: true }],
      ]);

      const serialized = adapter.serialize(testMap);
      const deserialized = adapter.deserialize(serialized);

      expect(deserialized instanceof Map).toBe(true);
      expect(deserialized.get('string')).toBe('value');
      expect(deserialized.get('number')).toBe(42);
      expect(deserialized.get('object')).toEqual({ nested: true });
      expect(deserialized.size).toBe(3);
    });

    it('should handle empty Maps', () => {
      const emptyMap = new Map();

      const serialized = adapter.serialize(emptyMap);
      const deserialized = adapter.deserialize(serialized);

      expect(deserialized instanceof Map).toBe(true);
      expect(deserialized.size).toBe(0);
    });
  });

  describe('SetSerializationAdapter', () => {
    const adapter = new SetSerializationAdapter();

    it('should handle Set objects', () => {
      const testSet = new Set(['a', 'b']);

      expect(adapter.canHandle(testSet)).toBe(true);
      expect(adapter.canHandle([])).toBe(false);
      expect(adapter.canHandle({})).toBe(false);
    });

    it('should serialize and deserialize Sets correctly', () => {
      const testSet = new Set(['a', 'b', 'c', 1, 2, 3]);

      const serialized = adapter.serialize(testSet);
      const deserialized = adapter.deserialize(serialized);

      expect(deserialized instanceof Set).toBe(true);
      expect(deserialized.size).toBe(6);
      expect(deserialized.has('a')).toBe(true);
      expect(deserialized.has(1)).toBe(true);
      expect(deserialized.has('nonexistent')).toBe(false);
    });

    it('should preserve Set uniqueness', () => {
      const testSet = new Set(['duplicate', 'duplicate', 'unique']);

      const serialized = adapter.serialize(testSet);
      const deserialized = adapter.deserialize(serialized);

      expect(deserialized.size).toBe(2);
      expect(deserialized.has('duplicate')).toBe(true);
      expect(deserialized.has('unique')).toBe(true);
    });
  });

  describe('RegExpSerializationAdapter', () => {
    const adapter = new RegExpSerializationAdapter();

    it('should handle RegExp objects', () => {
      const testRegex = /test/gi;

      expect(adapter.canHandle(testRegex)).toBe(true);
      expect(adapter.canHandle('string')).toBe(false);
      expect(adapter.canHandle({})).toBe(false);
    });

    it('should serialize and deserialize RegExp correctly', () => {
      const testRegex = /hello\s+world/gim;

      const serialized = adapter.serialize(testRegex);
      const deserialized = adapter.deserialize(serialized);

      expect(deserialized instanceof RegExp).toBe(true);
      expect(deserialized.source).toBe(testRegex.source);
      expect(deserialized.flags).toBe(testRegex.flags);
      expect(deserialized.test('Hello   World')).toBe(true);
    });

    it('should handle RegExp without flags', () => {
      const testRegex = /simple/;

      const serialized = adapter.serialize(testRegex);
      const deserialized = adapter.deserialize(serialized);

      expect(deserialized.flags).toBe('');
      expect(deserialized.source).toBe('simple');
    });
  });

  describe('BigIntSerializationAdapter', () => {
    const adapter = new BigIntSerializationAdapter();

    it('should handle BigInt values', () => {
      const testBigInt = BigInt('9007199254740991');

      expect(adapter.canHandle(testBigInt)).toBe(true);
      expect(adapter.canHandle(123)).toBe(false);
      expect(adapter.canHandle('123')).toBe(false);
    });

    it('should serialize and deserialize BigInt correctly', () => {
      const testBigInt = BigInt('123456789012345678901234567890');

      const serialized = adapter.serialize(testBigInt);
      const deserialized = adapter.deserialize(serialized);

      expect(typeof deserialized).toBe('bigint');
      expect(deserialized).toBe(testBigInt);
    });

    it('should handle very large BigInt values', () => {
      const largeBigInt = BigInt(Number.MAX_SAFE_INTEGER) * BigInt(2);

      const serialized = adapter.serialize(largeBigInt);
      const deserialized = adapter.deserialize(serialized);

      expect(deserialized).toBe(largeBigInt);
    });
  });

  describe('URLSerializationAdapter', () => {
    const adapter = new URLSerializationAdapter();

    it('should handle URL objects', () => {
      const testUrl = new URL('https://example.com');

      expect(adapter.canHandle(testUrl)).toBe(true);
      expect(adapter.canHandle('https://example.com')).toBe(false);
      expect(adapter.canHandle({})).toBe(false);
    });

    it('should serialize and deserialize URL correctly', () => {
      const testUrl = new URL('https://example.com/path?query=value#fragment');

      const serialized = adapter.serialize(testUrl);
      const deserialized = adapter.deserialize(serialized);

      expect(deserialized instanceof URL).toBe(true);
      expect(deserialized.href).toBe(testUrl.href);
      expect(deserialized.hostname).toBe('example.com');
      expect(deserialized.pathname).toBe('/path');
      expect(deserialized.search).toBe('?query=value');
      expect(deserialized.hash).toBe('#fragment');
    });
  });

  describe('ErrorSerializationAdapter', () => {
    const adapter = new ErrorSerializationAdapter();

    it('should handle Error objects', () => {
      const testError = new Error('Test error');

      expect(adapter.canHandle(testError)).toBe(true);
      expect(adapter.canHandle('error string')).toBe(false);
      expect(adapter.canHandle({})).toBe(false);
    });

    it('should serialize and deserialize Error correctly', () => {
      const testError = new Error('Test error message');
      testError.name = 'CustomError';

      const serialized = adapter.serialize(testError);
      const deserialized = adapter.deserialize(serialized);

      expect(deserialized instanceof Error).toBe(true);
      expect(deserialized.message).toBe('Test error message');
      expect(deserialized.name).toBe('CustomError');
    });

    it('should handle TypeError correctly', () => {
      const typeError = new TypeError('Type error message');

      const serialized = adapter.serialize(typeError);
      const deserialized = adapter.deserialize(serialized);

      expect(deserialized instanceof Error).toBe(true);
      expect(deserialized.message).toBe('Type error message');
      expect(deserialized.name).toBe('TypeError');
    });
  });

  describe('BufferSerializationAdapter', () => {
    // Skip if Buffer is not available (browser environment)
    const isNode = typeof Buffer !== 'undefined';

    (isNode ? describe : describe.skip)('with Buffer support', () => {
      const adapter = new BufferSerializationAdapter();

      it('should handle Buffer objects', () => {
        const testBuffer = Buffer.from('hello world');

        expect(adapter.canHandle(testBuffer)).toBe(true);
        expect(adapter.canHandle('string')).toBe(false);
        expect(adapter.canHandle(new Uint8Array([1, 2, 3]))).toBe(false);
      });

      it('should serialize and deserialize Buffer correctly', () => {
        const testBuffer = Buffer.from('Hello, World!', 'utf8');

        const serialized = adapter.serialize(testBuffer);
        const deserialized = adapter.deserialize(serialized);

        expect(Buffer.isBuffer(deserialized)).toBe(true);
        expect(deserialized.toString('utf8')).toBe('Hello, World!');
        expect(deserialized.equals(testBuffer)).toBe(true);
      });

      it('should handle binary data', () => {
        const binaryData = Buffer.from([0, 1, 255, 128, 64]);

        const serialized = adapter.serialize(binaryData);
        const deserialized = adapter.deserialize(serialized);

        expect(Buffer.isBuffer(deserialized)).toBe(true);
        expect(Array.from(deserialized)).toEqual([0, 1, 255, 128, 64]);
      });
    });
  });

  describe('ClassInstanceSerializationAdapter', () => {
    const adapter = createPersonSerializationAdapter();

    it('should handle Person instances', () => {
      const person = new Person('John', 30, 'john@example.com');

      expect(adapter.canHandle(person)).toBe(true);
      expect(adapter.canHandle({})).toBe(false);
      expect(adapter.canHandle('string')).toBe(false);
    });

    it('should serialize and deserialize Person instances correctly', () => {
      const person = new Person('Jane Doe', 25, 'jane@example.com');

      const serialized = adapter.serialize(person);
      const deserialized = adapter.deserialize(serialized);

      expect(deserialized instanceof Person).toBe(true);
      expect(deserialized.name).toBe('Jane Doe');
      expect(deserialized.age).toBe(25);
      expect(deserialized.email).toBe('jane@example.com');
      expect(deserialized.greet()).toBe("Hello, I'm Jane Doe");
      expect(deserialized.isAdult()).toBe(true);
    });

    it('should preserve methods on deserialized instances', () => {
      const person = new Person('Minor', 16, 'minor@example.com');

      const serialized = adapter.serialize(person);
      const deserialized = adapter.deserialize(serialized);

      expect(typeof deserialized.greet).toBe('function');
      expect(typeof deserialized.isAdult).toBe('function');
      expect(deserialized.isAdult()).toBe(false);
    });
  });

  describe('TypedArraySerializationAdapter', () => {
    it('should handle Int32Array correctly', () => {
      const adapter = new TypedArraySerializationAdapter(Int32Array, 'Int32Array');
      const typedArray = new Int32Array([1, -2, 3, -4, 5]);

      expect(adapter.canHandle(typedArray)).toBe(true);
      expect(adapter.canHandle([1, 2, 3])).toBe(false);

      const serialized = adapter.serialize(typedArray);
      const deserialized = adapter.deserialize(serialized);

      expect(deserialized instanceof Int32Array).toBe(true);
      expect(Array.from(deserialized)).toEqual([1, -2, 3, -4, 5]);
    });

    it('should handle Float64Array correctly', () => {
      const adapter = new TypedArraySerializationAdapter(Float64Array, 'Float64Array');
      const typedArray = new Float64Array([1.1, 2.2, 3.3]);

      const serialized = adapter.serialize(typedArray);
      const deserialized = adapter.deserialize(serialized);

      expect(deserialized instanceof Float64Array).toBe(true);
      expect(Array.from(deserialized)).toEqual([1.1, 2.2, 3.3]);
    });

    it('should handle Uint8Array correctly', () => {
      const adapter = new TypedArraySerializationAdapter(Uint8Array, 'Uint8Array');
      const typedArray = new Uint8Array([0, 128, 255]);

      const serialized = adapter.serialize(typedArray);
      const deserialized = adapter.deserialize(serialized);

      expect(deserialized instanceof Uint8Array).toBe(true);
      expect(Array.from(deserialized)).toEqual([0, 128, 255]);
    });
  });

  describe('CompositeSerializationAdapter', () => {
    it('should delegate to appropriate adapters', () => {
      const composite = new CompositeSerializationAdapter();
      composite.addAdapter(new DateSerializationAdapter());
      composite.addAdapter(new RegExpSerializationAdapter());

      const testDate = new Date('2023-01-01');
      const testRegex = /test/g;

      expect(composite.canHandle(testDate)).toBe(true);
      expect(composite.canHandle(testRegex)).toBe(true);
      expect(composite.canHandle('string')).toBe(true); // Fallback

      // Test Date serialization
      const serializedDate = composite.serialize(testDate);
      const deserializedDate = composite.deserialize(serializedDate);
      expect(deserializedDate instanceof Date).toBe(true);
      expect(deserializedDate.getTime()).toBe(testDate.getTime());

      // Test RegExp serialization
      const serializedRegex = composite.serialize(testRegex);
      const deserializedRegex = composite.deserialize(serializedRegex);
      expect(deserializedRegex instanceof RegExp).toBe(true);
      expect(deserializedRegex.source).toBe('test');
      expect(deserializedRegex.flags).toBe('g');
    });

    it('should handle fallback serialization', () => {
      const composite = new CompositeSerializationAdapter();

      const plainObject = { key: 'value', number: 42 };
      const plainString = 'just a string';

      const serializedObject = composite.serialize(plainObject);
      const deserializedObject = composite.deserialize(serializedObject);
      expect(deserializedObject).toEqual(plainObject);

      const serializedString = composite.serialize(plainString);
      const deserializedString = composite.deserialize(serializedString);
      expect(deserializedString).toBe(plainString);
    });
  });

  describe('createStandardSerializationAdapter', () => {
    it('should create a composite adapter with standard types', () => {
      const adapter = createStandardSerializationAdapter();

      // Test various types
      const testDate = new Date();
      const testRegex = /pattern/i;
      const testUrl = new URL('https://example.com');
      const testError = new Error('test error');
      const testBigInt = BigInt(123);
      const testMap = new Map([['key', 'value']]);
      const testSet = new Set([1, 2, 3]);

      // All should be handled
      expect(adapter.canHandle(testDate)).toBe(true);
      expect(adapter.canHandle(testRegex)).toBe(true);
      expect(adapter.canHandle(testUrl)).toBe(true);
      expect(adapter.canHandle(testError)).toBe(true);
      expect(adapter.canHandle(testBigInt)).toBe(true);
      expect(adapter.canHandle(testMap)).toBe(true);
      expect(adapter.canHandle(testSet)).toBe(true);

      // Test serialization roundtrip for each type
      const dateRoundtrip = adapter.deserialize(adapter.serialize(testDate));
      expect(dateRoundtrip instanceof Date).toBe(true);

      const regexRoundtrip = adapter.deserialize(adapter.serialize(testRegex));
      expect(regexRoundtrip instanceof RegExp).toBe(true);

      const urlRoundtrip = adapter.deserialize(adapter.serialize(testUrl));
      expect(urlRoundtrip instanceof URL).toBe(true);
    });
  });

  describe('createTypedArrayAdapters', () => {
    it('should create adapters for all typed array types', () => {
      const adapters = createTypedArrayAdapters();

      expect(adapters.length).toBe(8);

      // Test each adapter
      const int8Array = new Int8Array([-128, 0, 127]);
      const uint8Array = new Uint8Array([0, 128, 255]);
      const int16Array = new Int16Array([-32768, 0, 32767]);
      const uint16Array = new Uint16Array([0, 32768, 65535]);
      const int32Array = new Int32Array([-2147483648, 0, 2147483647]);
      const uint32Array = new Uint32Array([0, 2147483648, 4294967295]);
      const float32Array = new Float32Array([1.1, 2.2, 3.3]);
      const float64Array = new Float64Array([1.1, 2.2, 3.3]);

      const testArrays = [
        int8Array, uint8Array, int16Array, uint16Array,
        int32Array, uint32Array, float32Array, float64Array,
      ];

      testArrays.forEach((testArray, index) => {
        const adapter = adapters[index];
        expect(adapter.canHandle(testArray)).toBe(true);

        const serialized = adapter.serialize(testArray);
        const deserialized = adapter.deserialize(serialized);

        expect(deserialized.constructor).toBe(testArray.constructor);
        expect(Array.from(deserialized)).toEqual(Array.from(testArray));
      });
    });
  });
});
