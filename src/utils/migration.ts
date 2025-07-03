/**
 * Utilities for migrating from string-only cache to typed cache
 */
export class CacheMigrationUtils {
  /**
   * Migrates a string-only cache value to a typed value
   * @param existingData The existing string data from cache
   * @param typeConstructor Optional constructor function for the target type
   * @returns The migrated typed value
   */
  static migrateStringCacheToTyped<T>(
    existingData: string,
    typeConstructor?: new (...args: any[]) => T,
  ): T {
    // First, try to detect if this is already a serialized object
    const valueType = this.detectValueType(existingData);

    switch (valueType) {
      case 'object':
      case 'array':
        try {
          const parsed = JSON.parse(existingData);
          if (typeConstructor) {
            // If a constructor is provided, try to create an instance
            return new (typeConstructor as any)(parsed);
          }
          return parsed as T;
        } catch {
          // If parsing fails, treat as string
          return existingData as unknown as T;
        }

      case 'primitive':
        try {
          // Handle specific primitive cases
          if (existingData === 'null') return null as unknown as T;
          if (existingData === 'true') return true as unknown as T;
          if (existingData === 'false') return false as unknown as T;
          if (this.isNumericString(existingData)) {
            const num = Number(existingData);
            return num as unknown as T;
          }
          // Fallback to JSON parsing
          return JSON.parse(existingData) as T;
        } catch {
          return existingData as unknown as T;
        }

      case 'string':
      default:
        // If it's a plain string, return as-is
        return existingData as unknown as T;
    }
  }

  /**
   * Detects the probable type of a serialized value
   * @param serialized The serialized string value
   * @returns The detected type category
   */
  static detectValueType(serialized: string): 'string' | 'object' | 'array' | 'primitive' {
    // Quick check for specific primitive values
    if (this.isNumericString(serialized)
        || this.isBooleanString(serialized)
        || serialized === 'null') {
      return 'primitive';
    }

    // Quick check for non-JSON strings
    if (!serialized.trim().startsWith('{')
        && !serialized.trim().startsWith('[')
        && !serialized.trim().startsWith('"')) {
      return 'string';
    }

    try {
      const parsed = JSON.parse(serialized);

      if (Array.isArray(parsed)) {
        return 'array';
      }

      if (parsed !== null && typeof parsed === 'object') {
        return 'object';
      }

      // Numbers, booleans, null
      return 'primitive';
    } catch {
      // If JSON parsing fails, it's likely a plain string
      return 'string';
    }
  }

  /**
   * Checks if a string represents a number
   */
  private static isNumericString(str: string): boolean {
    return !Number.isNaN(Number(str)) && !Number.isNaN(parseFloat(str));
  }

  /**
   * Checks if a string represents a boolean
   */
  private static isBooleanString(str: string): boolean {
    return str.toLowerCase() === 'true' || str.toLowerCase() === 'false';
  }

  /**
   * Attempts to infer the original type from a cache value
   * @param value The cache value to analyze
   * @returns A type hint that can be used for deserialization
   */
  static inferTypeHint(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object' && value.constructor) {
      return value.constructor.name;
    }
    return typeof value;
  }

  /**
   * Checks if a value needs migration from string-only format
   * @param value The value to check
   * @returns True if the value appears to be a legacy string-only cache entry
   */
  static needsMigration(value: any): boolean {
    // If it's not a string, it's already in the new format
    if (typeof value !== 'string') return false;

    // Check if it has type metadata (new format)
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && '__type__' in parsed) {
        return false; // Already has type metadata
      }
    } catch {
      // Not valid JSON, so it's likely a plain string
    }

    // If it's a plain string or JSON without type metadata, it needs migration
    return true;
  }
}
