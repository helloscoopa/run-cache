import { RunCache } from './run-cache';
import { SerializationAdapter } from './core/serialization';
import { 
  DateSerializationAdapter,
  MapSerializationAdapter,
  SetSerializationAdapter
} from './examples/serialization-adapters';
import {
  StringValidator,
  NumberValidator,
  ValidatorUtils,
  SchemaValidator,
} from './core/type-validation';

describe('RunCache Usage Examples', () => {
  beforeEach(async () => {
    // Clean slate for each test
    RunCache.flush();
    RunCache.clearEventListeners();
  });

  describe('Basic Usage Examples', () => {
    it('should support backward compatible string operations', async () => {
      // Backward compatible - existing code works unchanged
      await RunCache.set({ key: 'user:name', value: 'John Doe' });
      const name = await RunCache.get('user:name'); // string
      
      expect(name).toBe('John Doe');
      expect(typeof name).toBe('string');
    });

    it('should support new typed usage with interfaces', async () => {
      // New typed usage
      interface User {
        id: number;
        name: string;
        email: string;
      }

      const userData: User = { 
        id: 123, 
        name: 'John', 
        email: 'john@example.com' 
      };

      await RunCache.set<User>({ 
        key: 'user:123', 
        value: userData
      });
      
      const user = await RunCache.get<User>('user:123') as User | undefined; // User | undefined
      
      expect(user).toEqual(userData);
      expect(typeof user?.id).toBe('number');
      expect(typeof user?.name).toBe('string');
      expect(typeof user?.email).toBe('string');
    });

    it('should support typed cache instances', async () => {
      interface User {
        id: number;
        name: string;
        email: string;
      }

      const userData: User = { 
        id: 456, 
        name: 'Jane', 
        email: 'jane@example.com' 
      };

      // Typed cache instance
      const userCache = RunCache.createTypedCache<User>();
      await userCache.set({ key: 'user:456', value: userData });
      const user2 = await userCache.get('user:456') as User | undefined; // User | undefined
      
      expect(user2).toEqual(userData);
      expect(typeof user2?.id).toBe('number');
    });

    it('should handle complex nested objects', async () => {
      interface Address {
        street: string;
        city: string;
        zipCode: string;
      }

      interface User {
        id: number;
        name: string;
        address: Address;
        preferences: {
          theme: 'light' | 'dark';
          notifications: boolean;
        };
      }

      const complexUser: User = {
        id: 789,
        name: 'Alice',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          zipCode: '12345'
        },
        preferences: {
          theme: 'dark',
          notifications: true
        }
      };

      await RunCache.set<User>({ 
        key: 'user:complex', 
        value: complexUser 
      });
      
      const retrieved = await RunCache.get<User>('user:complex') as User | undefined;
      
      expect(retrieved).toEqual(complexUser);
      expect(retrieved?.address.city).toBe('Anytown');
      expect(retrieved?.preferences.theme).toBe('dark');
    });

    it('should support arrays and collections', async () => {
      interface Product {
        id: number;
        name: string;
        price: number;
      }

      const products: Product[] = [
        { id: 1, name: 'Laptop', price: 999.99 },
        { id: 2, name: 'Mouse', price: 29.99 },
        { id: 3, name: 'Keyboard', price: 79.99 }
      ];

      await RunCache.set<Product[]>({ 
        key: 'products:featured', 
        value: products 
      });
      
      const retrievedProducts = await RunCache.get<Product[]>('products:featured') as Product[] | undefined;
      
      expect(retrievedProducts).toEqual(products);
      expect(Array.isArray(retrievedProducts)).toBe(true);
      expect(retrievedProducts?.length).toBe(3);
      expect(typeof retrievedProducts?.[0].price).toBe('number');
    });

    it('should support primitive types', async () => {
      // Numbers
      await RunCache.set<number>({ key: 'count', value: 42 });
      const count = await RunCache.get<number>('count');
      expect(count).toBe(42);
      expect(typeof count).toBe('number');

      // Booleans
      await RunCache.set<boolean>({ key: 'flag', value: true });
      const flag = await RunCache.get<boolean>('flag');
      expect(flag).toBe(true);
      expect(typeof flag).toBe('boolean');

      // Arrays of primitives
      await RunCache.set<string[]>({ key: 'tags', value: ['red', 'green', 'blue'] });
      const tags = await RunCache.get<string[]>('tags');
      expect(tags).toEqual(['red', 'green', 'blue']);
    });

    it('should handle source functions with types', async () => {
      interface ApiResponse {
        data: string[];
        timestamp: number;
      }

      const mockApiCall = async (): Promise<ApiResponse> => {
        // Simulate API call
        return {
          data: ['item1', 'item2', 'item3'],
          timestamp: Date.now()
        };
      };

      await RunCache.set<ApiResponse>({
        key: 'api:data',
        sourceFn: mockApiCall,
        ttl: 60000 // 1 minute
      });

      const result = await RunCache.get<ApiResponse>('api:data') as ApiResponse | undefined;
      
      expect(result?.data).toEqual(['item1', 'item2', 'item3']);
      expect(typeof result?.timestamp).toBe('number');
    });
  });

  describe('Advanced Features Examples', () => {
    it('should support custom Date serialization adapter', async () => {
      // Use the existing DateSerializationAdapter
      const adapter = new DateSerializationAdapter();
      const testDate = new Date('2023-12-25T10:30:00Z');
      
      expect(adapter.canHandle(testDate)).toBe(true);
      expect(adapter.canHandle('not a date')).toBe(false);
      
      const serialized = adapter.serialize(testDate);
      const deserialized = adapter.deserialize(serialized);
      
      expect(deserialized).toEqual(testDate);
      expect(deserialized.getTime()).toBe(testDate.getTime());
    });

    it('should support Map serialization adapter', async () => {
      // Use the existing MapSerializationAdapter
      const adapter = new MapSerializationAdapter();
      const testMap = new Map<string, any>([
        ['key1', 'value1'],
        ['key2', 42],
        ['key3', { nested: true }]
      ]);
      
      expect(adapter.canHandle(testMap)).toBe(true);
      
      const serialized = adapter.serialize(testMap);
      const deserialized = adapter.deserialize(serialized);
      
      expect(deserialized.get('key1')).toBe('value1');
      expect(deserialized.get('key2')).toBe(42);
      expect(deserialized.get('key3')).toEqual({ nested: true });
    });

    it('should support Set serialization adapter', async () => {
      // Use the existing SetSerializationAdapter
      const adapter = new SetSerializationAdapter();
      const testSet = new Set(['a', 'b', 'c', 1, 2, 3]);
      
      expect(adapter.canHandle(testSet)).toBe(true);
      
      const serialized = adapter.serialize(testSet);
      const deserialized = adapter.deserialize(serialized);
      
      expect(deserialized.size).toBe(6);
      expect(deserialized.has('a')).toBe(true);
      expect(deserialized.has(1)).toBe(true);
    });

    it('should demonstrate type validation integration', async () => {
      interface User {
        id: number;
        name: string;
        email: string;
        age?: number;
      }

      // Type validation example
      const userValidator = new SchemaValidator<User>(
        (value): value is User => 
          typeof value === 'object' && 
          value !== null &&
          typeof value.id === 'number' &&
          typeof value.name === 'string' &&
          typeof value.email === 'string' &&
          value.email.includes('@') &&
          (value.age === undefined || typeof value.age === 'number'),
        'User'
      );

      // Valid user
      const validUser: User = {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      };

      expect(userValidator.validate(validUser)).toBe(true);

      // Invalid users
      expect(userValidator.validate({
        id: 'not-a-number',
        name: 'John',
        email: 'john@example.com'
      })).toBe(false);

      expect(userValidator.validate({
        id: 1,
        name: 'John',
        email: 'invalid-email'
      })).toBe(false);
    });

    it('should support complex validation scenarios', async () => {
      // API Response with generic data
      interface ApiResponse<T> {
        data: T;
        status: number;
        message: string;
        timestamp: number;
      }

      interface UserList {
        users: Array<{
          id: number;
          name: string;
        }>;
        total: number;
      }

      const userListValidator = ValidatorUtils.object({
        users: ValidatorUtils.array(
          ValidatorUtils.object({
            id: NumberValidator,
            name: StringValidator
          })
        ),
        total: NumberValidator
      });

      const apiResponseValidator = ValidatorUtils.object({
        data: userListValidator,
        status: NumberValidator,
        message: StringValidator,
        timestamp: NumberValidator
      });

      const validResponse: ApiResponse<UserList> = {
        data: {
          users: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
          ],
          total: 2
        },
        status: 200,
        message: 'Success',
        timestamp: Date.now()
      };

      expect(apiResponseValidator.validate(validResponse)).toBe(true);

      // Test caching with this complex type
      await RunCache.set<ApiResponse<UserList>>({
        key: 'api:users',
        value: validResponse
      });

      const retrieved = await RunCache.get<ApiResponse<UserList>>('api:users') as ApiResponse<UserList> | undefined;
      expect(retrieved).toEqual(validResponse);
      expect(retrieved?.data.users.length).toBe(2);
      expect(typeof retrieved?.data.users[0].id).toBe('number');
    });

    it('should handle enum types', async () => {
      enum UserRole {
        ADMIN = 'admin',
        USER = 'user',
        MODERATOR = 'moderator'
      }

      interface User {
        id: number;
        name: string;
        role: UserRole;
      }

      const user: User = {
        id: 1,
        name: 'Admin User',
        role: UserRole.ADMIN
      };

      await RunCache.set<User>({ key: 'user:admin', value: user });
      const retrieved = await RunCache.get<User>('user:admin') as User | undefined;

      expect(retrieved?.role).toBe(UserRole.ADMIN);
      expect(retrieved?.role).toBe('admin');
    });

    it('should support union types', async () => {
      type StringOrNumber = string | number;
      type ConfigValue = string | number | boolean | null;

      // Union of primitives
      await RunCache.set<StringOrNumber>({ key: 'union:simple', value: 'text' });
      await RunCache.set<StringOrNumber>({ key: 'union:number', value: 123 });

      const text = await RunCache.get<StringOrNumber>('union:simple');
      const num = await RunCache.get<StringOrNumber>('union:number');

      expect(text).toBe('text');
      expect(num).toBe(123);

      // Complex union
      const configValues: ConfigValue[] = ['setting1', 42, true, null];
      await RunCache.set<ConfigValue[]>({ key: 'config:values', value: configValues });
      
      const retrieved = await RunCache.get<ConfigValue[]>('config:values');
      expect(retrieved).toEqual(configValues);
    });

    it('should handle optional properties', async () => {
      interface UserProfile {
        id: number;
        name: string;
        email: string;
        bio?: string;
        avatarUrl?: string;
        preferences?: {
          theme?: 'light' | 'dark';
          notifications?: boolean;
        };
      }

      const minimalProfile: UserProfile = {
        id: 1,
        name: 'Jane',
        email: 'jane@example.com'
      };

      const fullProfile: UserProfile = {
        id: 2,
        name: 'John',
        email: 'john@example.com',
        bio: 'Software developer',
        avatarUrl: 'https://example.com/avatar.jpg',
        preferences: {
          theme: 'dark',
          notifications: true
        }
      };

      await RunCache.set<UserProfile>({ key: 'profile:minimal', value: minimalProfile });
      await RunCache.set<UserProfile>({ key: 'profile:full', value: fullProfile });

      const retrievedMinimal = await RunCache.get<UserProfile>('profile:minimal') as UserProfile | undefined;
      const retrievedFull = await RunCache.get<UserProfile>('profile:full') as UserProfile | undefined;

      expect(retrievedMinimal?.bio).toBeUndefined();
      expect(retrievedFull?.bio).toBe('Software developer');
      expect(retrievedFull?.preferences?.theme).toBe('dark');
    });
  });

  describe('Mixed Type Usage', () => {
    it('should handle mixed string and typed values in same cache', async () => {
      // Legacy string value
      await RunCache.set({ key: 'legacy:string', value: 'old format' });

      // Modern typed values
      interface ModernData {
        version: number;
        features: string[];
      }

      const modernData: ModernData = {
        version: 2,
        features: ['typing', 'validation', 'serialization']
      };

      await RunCache.set<ModernData>({ key: 'modern:data', value: modernData });

      // Both should coexist
      const legacyValue = await RunCache.get('legacy:string');
      const modernValue = await RunCache.get<ModernData>('modern:data') as ModernData | undefined;

      expect(legacyValue).toBe('old format');
      expect(typeof legacyValue).toBe('string');
      
      expect(modernValue?.version).toBe(2);
      expect(Array.isArray(modernValue?.features)).toBe(true);
    });

    it('should handle type coercion scenarios gracefully', async () => {
      // Store a number as a typed value
      await RunCache.set<number>({ key: 'typed:number', value: 42 });
      
      // Try to retrieve as different types (this should work due to serialization)
      const asNumber = await RunCache.get<number>('typed:number');
      const asAny = await RunCache.get('typed:number');

      expect(asNumber).toBe(42);
      expect(asAny).toBe(42);
      expect(typeof asNumber).toBe('number');
      expect(typeof asAny).toBe('number');
    });
  });
});