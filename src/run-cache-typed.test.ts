/**
 * @file Tests for RunCache generic/typed functionality
 */

import { RunCache, TypedCacheInterface } from './run-cache';

// Test interfaces
interface User {
  id: number;
  name: string;
  email: string;
  age?: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
}

describe('RunCache Typed Functionality', () => {
  beforeEach(async () => {
    await RunCache.flush();
    await RunCache.clearEventListeners();
  });

  afterEach(async () => {
    await RunCache.flush();
    await RunCache.clearEventListeners();
  });

  describe('Generic RunCache.set and RunCache.get', () => {
    it('should store and retrieve objects with correct typing', async () => {
      const user: User = {
        id: 123,
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      };

      // Store a typed object
      await RunCache.set<User>({
        key: 'user:123',
        value: user,
      });

      // Retrieve with correct typing
      const retrieved = await RunCache.get<User>('user:123');

      expect(retrieved).toEqual(user);
      
      // Type assertion for single value (not array)
      const singleUser = retrieved as User;
      expect(typeof singleUser?.id).toBe('number');
      expect(typeof singleUser?.name).toBe('string');
      expect(typeof singleUser?.email).toBe('string');
      expect(typeof singleUser?.age).toBe('number');
    });

    it('should handle arrays of objects', async () => {
      const products: Product[] = [
        { id: '1', name: 'Laptop', price: 999.99, category: 'Electronics' },
        { id: '2', name: 'Book', price: 19.99, category: 'Education' },
      ];

      await RunCache.set<Product[]>({
        key: 'products:list',
        value: products,
      });

      const retrieved = await RunCache.get<Product[]>('products:list');

      expect(retrieved).toEqual(products);
      expect(Array.isArray(retrieved)).toBe(true);
      
      const productArray = retrieved as Product[];
      expect(productArray?.length).toBe(2);
      expect(productArray?.[0].price).toBe(999.99);
    });

    it('should handle primitive types other than strings', async () => {
      // Numbers
      await RunCache.set<number>({ key: 'score', value: 42 });
      const score = await RunCache.get<number>('score');
      expect(score).toBe(42);
      expect(typeof score).toBe('number');

      // Booleans
      await RunCache.set<boolean>({ key: 'flag', value: true });
      const flag = await RunCache.get<boolean>('flag');
      expect(flag).toBe(true);
      expect(typeof flag).toBe('boolean');

      // Null
      await RunCache.set<null>({ key: 'null-value', value: null });
      const nullValue = await RunCache.get<null>('null-value');
      expect(nullValue).toBeNull();
    });

    it('should maintain backward compatibility with string values', async () => {
      // Store a string value without specifying type (defaults to string)
      await RunCache.set({ key: 'legacy', value: 'string value' });
      const legacyValue = await RunCache.get('legacy');
      expect(legacyValue).toBe('string value');
      expect(typeof legacyValue).toBe('string');

      // Store a string value with explicit string type
      await RunCache.set<string>({ key: 'explicit-string', value: 'explicit value' });
      const explicitValue = await RunCache.get<string>('explicit-string');
      expect(explicitValue).toBe('explicit value');
      expect(typeof explicitValue).toBe('string');
    });

    it('should handle mixed string and object storage', async () => {
      // Store different types
      await RunCache.set({ key: 'string-key', value: 'string value' });
      await RunCache.set<User>({ key: 'user-key', value: { id: 1, name: 'John', email: 'john@test.com' } });
      await RunCache.set<number>({ key: 'number-key', value: 42 });

      // Retrieve with appropriate types
      const stringVal = await RunCache.get('string-key');
      const userVal = await RunCache.get<User>('user-key');
      const numberVal = await RunCache.get<number>('number-key');

      expect(stringVal).toBe('string value');
      expect(userVal).toEqual({ id: 1, name: 'John', email: 'john@test.com' });
      expect(numberVal).toBe(42);
    });

    it('should work with sourceFn for typed values', async () => {
      const fetchUser = async (): Promise<User> => {
        return {
          id: 456,
          name: 'Jane Doe',
          email: 'jane@example.com',
          age: 25,
        };
      };

      await RunCache.set<User>({
        key: 'user:456',
        sourceFn: fetchUser,
        ttl: 1000,
      });

      const user = await RunCache.get<User>('user:456');
      expect(user).toEqual({
        id: 456,
        name: 'Jane Doe',
        email: 'jane@example.com',
        age: 25,
      });
    });

    it('should handle wildcard patterns with typed values', async () => {
      const users: User[] = [
        { id: 1, name: 'Alice', email: 'alice@test.com' },
        { id: 2, name: 'Bob', email: 'bob@test.com' },
        { id: 3, name: 'Charlie', email: 'charlie@test.com' },
      ];

      // Store multiple users
      for (const user of users) {
        await RunCache.set<User>({
          key: `user:${user.id}`,
          value: user,
        });
      }

      // Retrieve with wildcard
      const allUsers = await RunCache.get<User>('user:*');
      expect(Array.isArray(allUsers)).toBe(true);
      expect(allUsers).toHaveLength(3);
      
      // Check that objects are properly deserialized
      const userArray = allUsers as User[];
      userArray?.forEach((user, index) => {
        expect(typeof user.id).toBe('number');
        expect(typeof user.name).toBe('string');
        expect(typeof user.email).toBe('string');
      });
    });
  });

  describe('TypedCacheInterface', () => {
    it('should create a typed cache interface', async () => {
      const userCache = RunCache.createTypedCache<User>();
      expect(userCache).toBeInstanceOf(TypedCacheInterface);
    });

    it('should provide type-safe operations', async () => {
      const userCache = RunCache.createTypedCache<User>();
      
      const user: User = {
        id: 789,
        name: 'Typed User',
        email: 'typed@example.com',
      };

      await userCache.set({
        key: 'typed:user:789',
        value: user,
      });

      const retrieved = await userCache.get('typed:user:789');
      expect(retrieved).toEqual(user);
      
      const singleUser = retrieved as User;
      expect(typeof singleUser?.id).toBe('number');
    });

    it('should support all cache operations with typing', async () => {
      const productCache = RunCache.createTypedCache<Product>();
      
      const product: Product = {
        id: 'laptop-123',
        name: 'Gaming Laptop',
        price: 1299.99,
        category: 'Gaming',
      };

      // Test set
      await productCache.set({
        key: 'product:laptop-123',
        value: product,
        ttl: 5000,
      });

      // Test get
      const retrieved = await productCache.get('product:laptop-123');
      expect(retrieved).toEqual(product);

      // Test has
      const exists = await productCache.has('product:laptop-123');
      expect(exists).toBe(true);

      // Test delete
      const deleted = await productCache.delete('product:laptop-123');
      expect(deleted).toBe(true);

      // Verify deletion
      const afterDelete = await productCache.get('product:laptop-123');
      expect(afterDelete).toBeUndefined();
    });

    it('should work with sourceFn in typed interface', async () => {
      const numberCache = RunCache.createTypedCache<number>();
      
      let callCount = 0;
      const fetchNumber = async (): Promise<number> => {
        callCount++;
        return Math.random() * 100;
      };

      await numberCache.set({
        key: 'random:number',
        sourceFn: fetchNumber,
        ttl: 1000,
      });

      const value1 = await numberCache.get('random:number');
      expect(typeof value1).toBe('number');
      expect(callCount).toBe(1);

      // Should return cached value
      const value2 = await numberCache.get('random:number');
      expect(value2).toBe(value1);
      expect(callCount).toBe(1);

      // Test refetch
      await numberCache.refetch('random:number');
      expect(callCount).toBe(2);
    });
  });

  describe('Complex Object Serialization', () => {
    it('should handle nested objects', async () => {
      interface NestedData {
        user: User;
        metadata: {
          lastLogin: string;
          preferences: {
            theme: 'light' | 'dark';
            notifications: boolean;
          };
        };
        tags: string[];
      }

      const complexData: NestedData = {
        user: { id: 1, name: 'Complex User', email: 'complex@test.com' },
        metadata: {
          lastLogin: '2023-01-01T00:00:00Z',
          preferences: {
            theme: 'dark',
            notifications: true,
          },
        },
        tags: ['admin', 'premium'],
      };

      await RunCache.set<NestedData>({
        key: 'complex:data',
        value: complexData,
      });

      const retrieved = await RunCache.get<NestedData>('complex:data');
      expect(retrieved).toEqual(complexData);
      
      const nestedData = retrieved as NestedData;
      expect(nestedData?.user.id).toBe(1);
      expect(nestedData?.metadata.preferences.theme).toBe('dark');
      expect(Array.isArray(nestedData?.tags)).toBe(true);
    });

    it('should handle Date objects properly', async () => {
      const now = new Date();
      
      await RunCache.set<Date>({
        key: 'date:now',
        value: now,
      });

      const retrieved = await RunCache.get<Date>('date:now');
      
      // Note: Dates will be serialized as ISO strings and may need special handling
      // This test verifies the current behavior
      expect(retrieved).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle serialization/deserialization gracefully', async () => {
      // Store a valid object
      const user: User = { id: 1, name: 'Test', email: 'test@example.com' };
      await RunCache.set<User>({ key: 'error:test', value: user });

      // This should work fine
      const retrieved = await RunCache.get<User>('error:test');
      expect(retrieved).toEqual(user);
    });

    it('should handle undefined values correctly', async () => {
      // Getting a key that doesn't exist should return undefined
      const retrieved = await RunCache.get<User>('nonexistent:key');
      expect(retrieved).toBeUndefined();
    });
  });
});