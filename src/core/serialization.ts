/**
 * @file Serialization system for RunCache to support typed values while maintaining persistence compatibility
 */

/**
 * Interface for custom serialization adapters that handle specific data types
 *
 * @template T The type of value this adapter can handle
 */
export interface SerializationAdapter<T = any> {
  /**
   * Serialize a value to a string representation
   *
   * @param value The value to serialize
   * @returns The serialized string representation
   */
  serialize(value: T): string;

  /**
   * Deserialize a string back to the original value
   *
   * @param serialized The serialized string
   * @returns The deserialized value
   */
  deserialize(serialized: string): T;

  /**
   * Check if this adapter can handle the given value type
   *
   * @param value The value to check
   * @returns True if this adapter can handle the value
   */
  canHandle(value: any): boolean;
}

/**
 * Default serialization adapter that handles basic JavaScript types
 * Uses JSON serialization with string pass-through for backward compatibility
 */
export class DefaultSerializationAdapter implements SerializationAdapter {
  /**
   * Serialize any value to string
   * Strings are returned as-is for backward compatibility
   * Other types are JSON stringified
   */
  serialize(value: any): string {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  }

  /**
   * Deserialize string back to original value
   * Attempts JSON parsing, falls back to string if parsing fails
   */
  deserialize(serialized: string): any {
    try {
      return JSON.parse(serialized);
    } catch {
      // If JSON parsing fails, assume it's a plain string
      return serialized;
    }
  }

  /**
   * Default adapter can handle any value
   */
  canHandle(value: any): boolean {
    return true;
  }
}

/**
 * Manager for handling serialization with multiple adapters
 * Adapters are checked in order of registration (LIFO - last in, first out)
 */
export class SerializationManager {
  private adapters: SerializationAdapter[] = [];

  private defaultAdapter = new DefaultSerializationAdapter();

  /**
   * Add a custom serialization adapter
   * Adapters are added to the front of the list for priority handling
   *
   * @param adapter The serialization adapter to add
   */
  addAdapter(adapter: SerializationAdapter): void {
    this.adapters.unshift(adapter); // Add to front for priority
  }

  /**
   * Remove all custom adapters, keeping only the default
   */
  clearAdapters(): void {
    this.adapters = [];
  }

  /**
   * Serialize a value using the first matching adapter
   *
   * @param value The value to serialize
   * @returns The serialized string
   */
  serialize(value: any): string {
    const adapter = this.adapters.find((a) => a.canHandle(value)) || this.defaultAdapter;
    return adapter.serialize(value);
  }

  /**
   * Deserialize a string using the appropriate adapter
   * For backward compatibility, tries to infer type from hint or uses default
   *
   * @template T The expected return type
   * @param serialized The serialized string
   * @param hint Optional hint about the expected type for adapter selection
   * @returns The deserialized value
   */
  deserialize<T>(serialized: string, hint?: any): T {
    // Try to find an adapter that can handle the hint type
    const adapter = this.adapters.find((a) => hint && a.canHandle(hint)) || this.defaultAdapter;
    return adapter.deserialize(serialized);
  }

  /**
   * Get the list of registered custom adapters (excluding default)
   *
   * @returns Array of registered adapters
   */
  getAdapters(): SerializationAdapter[] {
    return [...this.adapters];
  }
}
