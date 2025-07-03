/**
 * Advanced serialization adapter examples for RunCache
 * Demonstrates how to create custom serialization for complex types
 */

import { SerializationAdapter } from '../core/serialization';

/**
 * Date serialization adapter that preserves timezone information
 */
export class DateSerializationAdapter implements SerializationAdapter<Date> {
  serialize(value: Date): string {
    return JSON.stringify({
      __type__: 'Date',
      value: value.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }

  deserialize(serialized: string): Date {
    try {
      const parsed = JSON.parse(serialized);
      if (parsed.__type__ === 'Date') {
        return new Date(parsed.value);
      }
    } catch {
      // Fallback to direct parsing
    }
    return new Date(serialized);
  }

  canHandle(value: any): boolean {
    return value instanceof Date;
  }
}

/**
 * Map serialization adapter for key-value pairs
 */
export class MapSerializationAdapter<K = any, V = any> implements SerializationAdapter<Map<K, V>> {
  serialize(value: Map<K, V>): string {
    return JSON.stringify({
      __type__: 'Map',
      entries: Array.from(value.entries()),
    });
  }

  deserialize(serialized: string): Map<K, V> {
    try {
      const parsed = JSON.parse(serialized);
      if (parsed.__type__ === 'Map' && Array.isArray(parsed.entries)) {
        return new Map(parsed.entries);
      }
    } catch {
      // Fallback
    }
    return new Map();
  }

  canHandle(value: any): boolean {
    return value instanceof Map;
  }
}

/**
 * Set serialization adapter for unique collections
 */
export class SetSerializationAdapter<T = any> implements SerializationAdapter<Set<T>> {
  serialize(value: Set<T>): string {
    return JSON.stringify({
      __type__: 'Set',
      values: Array.from(value.values()),
    });
  }

  deserialize(serialized: string): Set<T> {
    try {
      const parsed = JSON.parse(serialized);
      if (parsed.__type__ === 'Set' && Array.isArray(parsed.values)) {
        return new Set(parsed.values);
      }
    } catch {
      // Fallback
    }
    return new Set();
  }

  canHandle(value: any): boolean {
    return value instanceof Set;
  }
}

/**
 * RegExp serialization adapter for regular expressions
 */
export class RegExpSerializationAdapter implements SerializationAdapter<RegExp> {
  serialize(value: RegExp): string {
    return JSON.stringify({
      __type__: 'RegExp',
      source: value.source,
      flags: value.flags,
    });
  }

  deserialize(serialized: string): RegExp {
    try {
      const parsed = JSON.parse(serialized);
      if (parsed.__type__ === 'RegExp') {
        return new RegExp(parsed.source, parsed.flags);
      }
    } catch {
      // Fallback
    }
    return /(?:)/;
  }

  canHandle(value: any): boolean {
    return value instanceof RegExp;
  }
}

/**
 * BigInt serialization adapter for large integers
 */
export class BigIntSerializationAdapter implements SerializationAdapter<bigint> {
  serialize(value: bigint): string {
    return JSON.stringify({
      __type__: 'BigInt',
      value: value.toString(),
    });
  }

  deserialize(serialized: string): bigint {
    try {
      const parsed = JSON.parse(serialized);
      if (parsed.__type__ === 'BigInt') {
        return BigInt(parsed.value);
      }
    } catch {
      // Fallback
    }
    return BigInt(0);
  }

  canHandle(value: any): boolean {
    return typeof value === 'bigint';
  }
}

/**
 * URL serialization adapter for URL objects
 */
export class URLSerializationAdapter implements SerializationAdapter<URL> {
  serialize(value: URL): string {
    return JSON.stringify({
      __type__: 'URL',
      href: value.href,
    });
  }

  deserialize(serialized: string): URL {
    try {
      const parsed = JSON.parse(serialized);
      if (parsed.__type__ === 'URL') {
        return new URL(parsed.href);
      }
    } catch {
      // Fallback
    }
    return new URL('about:blank');
  }

  canHandle(value: any): boolean {
    return value instanceof URL;
  }
}

/**
 * Error serialization adapter for Error objects
 */
export class ErrorSerializationAdapter implements SerializationAdapter<Error> {
  serialize(value: Error): string {
    return JSON.stringify({
      __type__: 'Error',
      name: value.name,
      message: value.message,
      stack: value.stack,
    });
  }

  deserialize(serialized: string): Error {
    try {
      const parsed = JSON.parse(serialized);
      if (parsed.__type__ === 'Error') {
        const error = new Error(parsed.message);
        error.name = parsed.name;
        error.stack = parsed.stack;
        return error;
      }
    } catch {
      // Fallback
    }
    return new Error('Deserialization failed');
  }

  canHandle(value: any): boolean {
    return value instanceof Error;
  }
}

/**
 * Buffer serialization adapter for Node.js Buffer objects
 */
export class BufferSerializationAdapter implements SerializationAdapter<Buffer> {
  serialize(value: Buffer): string {
    return JSON.stringify({
      __type__: 'Buffer',
      data: value.toString('base64'),
    });
  }

  deserialize(serialized: string): Buffer {
    try {
      const parsed = JSON.parse(serialized);
      if (parsed.__type__ === 'Buffer') {
        return Buffer.from(parsed.data, 'base64');
      }
    } catch {
      // Fallback
    }
    return Buffer.alloc(0);
  }

  canHandle(value: any): boolean {
    return Buffer.isBuffer(value);
  }
}

/**
 * Class instance serialization adapter for custom classes
 * This is a generic adapter that can handle any class with a constructor
 */
export class ClassInstanceSerializationAdapter<T> implements SerializationAdapter<T> {
  private ClassConstructor: new (...args: any[]) => T;

  private className: string;

  constructor(
    ClassConstructor: new (...args: any[]) => T,
    className: string,
  ) {
    this.ClassConstructor = ClassConstructor;
    this.className = className;
  }

  serialize(value: T): string {
    return JSON.stringify({
      __type__: 'ClassInstance',
      className: this.className,
      data: { ...value }, // Spread to get enumerable properties
    });
  }

  deserialize(serialized: string): T {
    try {
      const parsed = JSON.parse(serialized);
      if (parsed.__type__ === 'ClassInstance' && parsed.className === this.className) {
        const instance = Object.create(this.ClassConstructor.prototype);
        return Object.assign(instance, parsed.data);
      }
    } catch {
      // Fallback
    }
    return new this.ClassConstructor();
  }

  canHandle(value: any): boolean {
    return value instanceof this.ClassConstructor;
  }
}

/**
 * Typed Array serialization adapter for ArrayBuffer views
 */
export class TypedArraySerializationAdapter<T extends ArrayBufferView> implements SerializationAdapter<T> {
  private TypedArrayConstructor: new (buffer: ArrayBuffer) => T;

  private typeName: string;

  constructor(
    TypedArrayConstructor: new (buffer: ArrayBuffer) => T,
    typeName: string,
  ) {
    this.TypedArrayConstructor = TypedArrayConstructor;
    this.typeName = typeName;
  }

  serialize(value: T): string {
    const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    const uint8Array = new Uint8Array(buffer);
    return JSON.stringify({
      __type__: 'TypedArray',
      typeName: this.typeName,
      data: Array.from(uint8Array),
    });
  }

  deserialize(serialized: string): T {
    try {
      const parsed = JSON.parse(serialized);
      if (parsed.__type__ === 'TypedArray' && parsed.typeName === this.typeName) {
        const uint8Array = new Uint8Array(parsed.data);
        return new this.TypedArrayConstructor(uint8Array.buffer);
      }
    } catch {
      // Fallback
    }
    return new this.TypedArrayConstructor(new ArrayBuffer(0));
  }

  canHandle(value: any): boolean {
    return value instanceof this.TypedArrayConstructor;
  }
}

/**
 * Composite serialization adapter that handles multiple types
 */
export class CompositeSerializationAdapter implements SerializationAdapter<any> {
  private adapters: SerializationAdapter<any>[] = [];

  addAdapter(adapter: SerializationAdapter<any>): void {
    this.adapters.unshift(adapter); // Add to front for priority
  }

  serialize(value: any): string {
    const adapter = this.adapters.find((a) => a.canHandle(value));
    if (adapter) {
      return adapter.serialize(value);
    }

    // Default JSON serialization
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  }

  deserialize(serialized: string): any {
    // First, try to detect the type from the serialized format
    try {
      const parsed = JSON.parse(serialized);
      if (parsed && typeof parsed === 'object' && parsed.__type__) {
        // This is a typed serialization, match by __type__ field
        const targetType = parsed.__type__;

        for (const adapter of this.adapters) {
          try {
            const result = adapter.deserialize(serialized);
            // Check if the result matches the target type and adapter can handle it
            if (result !== undefined && adapter.canHandle(result)) {
              // Additional verification: the type should match what we expect
              if (
                (targetType === 'Date' && result instanceof Date)
                || (targetType === 'RegExp' && result instanceof RegExp)
                || (targetType === 'Map' && result instanceof Map)
                || (targetType === 'Set' && result instanceof Set)
                || (targetType === 'BigInt' && typeof result === 'bigint')
                || (targetType === 'URL' && result instanceof URL)
                || (targetType === 'Error' && result instanceof Error)
                || (targetType === 'Buffer' && Buffer.isBuffer && Buffer.isBuffer(result))
                || (targetType === 'ClassInstance')
                || (targetType === 'TypedArray')
              ) {
                return result;
              }
            }
          } catch {
            // Continue to next adapter
          }
        }
        // If no adapter handled it, fall back to JSON parsing
        return parsed;
      }
    } catch {
      // Not valid JSON, might be a plain string
    }

    // Default JSON deserialization
    try {
      return JSON.parse(serialized);
    } catch {
      return serialized; // Return as string if JSON parsing fails
    }
  }

  canHandle(value: any): boolean {
    return this.adapters.some((a) => a.canHandle(value)) || true; // Always can handle as fallback
  }
}

// Example usage and factory functions

/**
 * Creates a pre-configured composite adapter with common serialization needs
 */
export function createStandardSerializationAdapter(): CompositeSerializationAdapter {
  const composite = new CompositeSerializationAdapter();

  // Add adapters in order of specificity (most specific first)
  composite.addAdapter(new DateSerializationAdapter());
  composite.addAdapter(new RegExpSerializationAdapter());
  composite.addAdapter(new URLSerializationAdapter());
  composite.addAdapter(new ErrorSerializationAdapter());
  composite.addAdapter(new BigIntSerializationAdapter());
  composite.addAdapter(new MapSerializationAdapter());
  composite.addAdapter(new SetSerializationAdapter());

  // Add Buffer adapter if in Node.js environment
  if (typeof Buffer !== 'undefined') {
    composite.addAdapter(new BufferSerializationAdapter());
  }

  return composite;
}

/**
 * Creates typed array adapters for common array types
 */
export function createTypedArrayAdapters(): SerializationAdapter<any>[] {
  return [
    new TypedArraySerializationAdapter(Int8Array, 'Int8Array'),
    new TypedArraySerializationAdapter(Uint8Array, 'Uint8Array'),
    new TypedArraySerializationAdapter(Int16Array, 'Int16Array'),
    new TypedArraySerializationAdapter(Uint16Array, 'Uint16Array'),
    new TypedArraySerializationAdapter(Int32Array, 'Int32Array'),
    new TypedArraySerializationAdapter(Uint32Array, 'Uint32Array'),
    new TypedArraySerializationAdapter(Float32Array, 'Float32Array'),
    new TypedArraySerializationAdapter(Float64Array, 'Float64Array'),
  ];
}

/**
 * Example custom class for demonstration
 */
export class Person {
  public name: string;

  public age: number;

  public email: string;

  constructor(
    name: string = '',
    age: number = 0,
    email: string = '',
  ) {
    this.name = name;
    this.age = age;
    this.email = email;
  }

  greet(): string {
    return `Hello, I'm ${this.name}`;
  }

  isAdult(): boolean {
    return this.age >= 18;
  }
}

/**
 * Creates a Person-specific serialization adapter
 */
export function createPersonSerializationAdapter(): ClassInstanceSerializationAdapter<Person> {
  return new ClassInstanceSerializationAdapter(Person, 'Person');
}
