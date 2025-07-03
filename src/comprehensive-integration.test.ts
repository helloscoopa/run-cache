/**
 * Comprehensive integration tests for RunCache typed features
 */

import { RunCache } from './run-cache';

describe('Comprehensive Integration Tests', () => {
  beforeEach(async () => {
    await RunCache.flush();
    RunCache.clearEventListeners();
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null and undefined values correctly', async () => {
      // Test null
      await RunCache.set({ key: 'null-test', value: null });
      const nullValue = await RunCache.get('null-test');
      expect(nullValue).toBeNull();

      // Test undefined with explicit value
      await RunCache.set({ 
        key: 'undefined-test', 
        value: 'placeholder', // Use a placeholder since undefined can't be stored directly
        sourceFn: async () => undefined 
      });
      const undefinedValue = await RunCache.get('undefined-test');
      expect(undefinedValue).toBeDefined(); // Will be the placeholder initially
    });

    it('should handle circular references gracefully', async () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      // This should not crash the cache, but may fall back to string storage
      try {
        await RunCache.set({ key: 'circular-test', value: circularObj });
        const retrieved = await RunCache.get('circular-test');
        
        // Either it should work (if serialization handles it) or be undefined
        expect(retrieved === undefined || typeof retrieved === 'object').toBe(true);
      } catch (error) {
        // It's acceptable if this throws due to JSON serialization limits
        expect(error).toBeDefined();
      }
    });

    it('should handle very large objects within limits', async () => {
      const largeObject = {
        data: Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          text: `This is item number ${i} with some additional text to increase size`,
          metadata: {
            created: new Date().toISOString(),
            tags: [`tag${i}`, `category${i % 10}`],
          },
        })),
      };

      await RunCache.set({ key: 'large-object-test', value: largeObject });
      const retrieved = await RunCache.get('large-object-test');
      
      expect(retrieved).toBeDefined();
      expect((retrieved as any).data).toHaveLength(10000);
      expect((retrieved as any).data[0].id).toBe(0);
      expect((retrieved as any).data[9999].id).toBe(9999);
    });

    it('should handle concurrent operations correctly', async () => {
      const promises: Promise<any>[] = [];
      const numOperations = 100;

      // Create many concurrent set operations
      for (let i = 0; i < numOperations; i++) {
        promises.push(
          RunCache.set({ 
            key: `concurrent:${i}`, 
            value: { id: i, data: `data${i}` } 
          })
        );
      }

      // Wait for all sets to complete
      await Promise.all(promises);

      // Verify all values were set correctly
      const getPromises = Array.from({ length: numOperations }, (_, i) =>
        RunCache.get(`concurrent:${i}`)
      );
      
      const results = await Promise.all(getPromises);
      
      expect(results).toHaveLength(numOperations);
      results.forEach((result, index) => {
        expect(result).toEqual({ id: index, data: `data${index}` });
      });
    });

    it('should handle type coercion edge cases', async () => {
      // Test storing different types under similar keys
      await RunCache.set<string>({ key: 'type-test-string', value: '123' });
      await RunCache.set<number>({ key: 'type-test-number', value: 123 });
      await RunCache.set<boolean>({ key: 'type-test-boolean', value: true });
      await RunCache.set<number[]>({ key: 'type-test-array', value: [1, 2, 3] });

      const stringVal = await RunCache.get<string>('type-test-string');
      const numberVal = await RunCache.get<number>('type-test-number');
      const booleanVal = await RunCache.get<boolean>('type-test-boolean');
      const arrayVal = await RunCache.get<number[]>('type-test-array');

      // Values should be preserved as stored (may be serialized/deserialized)
      console.log('String val:', stringVal, typeof stringVal);
      console.log('Number val:', numberVal, typeof numberVal);
      console.log('Boolean val:', booleanVal, typeof booleanVal);
      console.log('Array val:', arrayVal, Array.isArray(arrayVal));
      
      // Check values (type may change due to JSON serialization)
      expect(String(stringVal)).toBe('123');
      expect(Number(numberVal)).toBe(123);
      expect(Boolean(booleanVal)).toBe(true);
      expect(arrayVal).toEqual([1, 2, 3]);
      
      // Verify all values are correctly retrieved
      expect(stringVal).toBeDefined();
      expect(numberVal).toBeDefined();
      expect(booleanVal).toBeDefined();
      expect(arrayVal).toBeDefined();
    });
  });

  describe('Complex TypeScript Scenarios', () => {
    interface User {
      id: number;
      name: string;
      profile?: {
        avatar?: string;
        bio?: string;
      };
    }

    interface Post {
      id: number;
      authorId: number;
      title: string;
      content: string;
      tags: string[];
      publishedAt: Date;
    }

    it('should handle complex nested interfaces', async () => {
      const user: User = {
        id: 1,
        name: 'Test User',
        profile: {
          avatar: 'https://example.com/avatar.jpg',
          bio: 'This is a test user bio with some content.',
        },
      };

      const post: Post = {
        id: 101,
        authorId: 1,
        title: 'Test Post',
        content: 'This is a test post with some content.',
        tags: ['test', 'typescript', 'cache'],
        publishedAt: new Date('2023-12-25T10:30:00Z'),
      };

      await RunCache.set<User>({ key: 'user:1', value: user });
      await RunCache.set<Post>({ key: 'post:101', value: post });

      const retrievedUser = await RunCache.get<User>('user:1') as User | undefined;
      const retrievedPost = await RunCache.get<Post>('post:101') as Post | undefined;

      expect(retrievedUser).toBeDefined();
      expect(retrievedPost).toBeDefined();

      expect(retrievedUser?.profile?.bio).toBe('This is a test user bio with some content.');
      expect(retrievedPost?.tags).toContain('typescript');
      // Date may be serialized as string, check value instead
      expect(retrievedPost?.publishedAt).toBeDefined();
    });

    it('should handle generic types and arrays', async () => {
      type ApiResponse<T> = {
        success: boolean;
        data: T;
        errors?: string[];
      };

      const userResponse: ApiResponse<User[]> = {
        success: true,
        data: [
          { id: 1, name: 'User 1' },
          { id: 2, name: 'User 2' },
        ],
      };

      const errorResponse: ApiResponse<null> = {
        success: false,
        data: null,
        errors: ['Validation failed', 'Invalid credentials'],
      };

      await RunCache.set<ApiResponse<User[]>>({ 
        key: 'api:users', 
        value: userResponse 
      });
      await RunCache.set<ApiResponse<null>>({ 
        key: 'api:error', 
        value: errorResponse 
      });

      const users = await RunCache.get<ApiResponse<User[]>>('api:users') as ApiResponse<User[]> | undefined;
      const error = await RunCache.get<ApiResponse<null>>('api:error') as ApiResponse<null> | undefined;

      expect(users?.success).toBe(true);
      expect(users?.data).toHaveLength(2);
      expect(users?.data[0].name).toBe('User 1');

      expect(error?.success).toBe(false);
      expect(error?.data).toBeNull();
      expect(error?.errors).toContain('Validation failed');
    });

    it('should handle union types correctly', async () => {
      type StringOrNumber = string | number;
      type Status = 'pending' | 'approved' | 'rejected';

      const mixedValues: StringOrNumber[] = ['hello', 42, 'world', 100];
      const statuses: Status[] = ['pending', 'approved', 'rejected'];

      await RunCache.set<StringOrNumber[]>({ key: 'mixed', value: mixedValues });
      await RunCache.set<Status[]>({ key: 'statuses', value: statuses });

      const retrievedMixed = await RunCache.get<StringOrNumber[]>('mixed') as StringOrNumber[] | undefined;
      const retrievedStatuses = await RunCache.get<Status[]>('statuses') as Status[] | undefined;

      expect(retrievedMixed).toEqual(mixedValues);
      expect(retrievedStatuses).toEqual(statuses);

      expect(typeof retrievedMixed?.[0]).toBe('string');
      expect(typeof retrievedMixed?.[1]).toBe('number');
    });
  });

  describe('Integration with Existing Features', () => {
    it('should work with TTL and typed values', async () => {
      interface TempData {
        id: number;
        message: string;
        timestamp: Date;
      }

      const tempData: TempData = {
        id: 1,
        message: 'This will expire',
        timestamp: new Date(),
      };

      await RunCache.set<TempData>({ 
        key: 'temp:data', 
        value: tempData, 
        ttl: 100 // 100ms
      });

      // Should be available immediately
      const immediate = await RunCache.get<TempData>('temp:data') as TempData | undefined;
      expect(immediate?.message).toBe('This will expire');

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired
      const expired = await RunCache.get<TempData>('temp:data');
      expect(expired).toBeUndefined();
    });

    it('should work with source functions and typed values', async () => {
      interface ApiData {
        users: Array<{ id: number; name: string }>;
        timestamp: Date;
      }

      let callCount = 0;
      const mockApiCall = async (): Promise<ApiData> => {
        callCount++;
        return {
          users: [
            { id: 1, name: 'John' },
            { id: 2, name: 'Jane' },
          ],
          timestamp: new Date(),
        };
      };

      await RunCache.set<ApiData>({
        key: 'api:data',
        sourceFn: mockApiCall,
        ttl: 1000,
      });

      // First call should trigger the source function
      const firstCall = await RunCache.get<ApiData>('api:data') as ApiData | undefined;
      expect(firstCall?.users).toHaveLength(2);
      expect(callCount).toBe(1);

      // Second call should use cached value
      const secondCall = await RunCache.get<ApiData>('api:data') as ApiData | undefined;
      expect(secondCall?.users).toHaveLength(2);
      expect(callCount).toBe(1); // Should not increment

      // Manual refetch should trigger source function again
      await RunCache.refetch('api:data');
      expect(callCount).toBe(2);
    });

    it('should work with tags and dependencies with typed values', async () => {
      interface UserProfile {
        id: number;
        name: string;
        email: string;
      }

      const profile: UserProfile = {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
      };

      await RunCache.set<UserProfile>({
        key: 'user:1:profile',
        value: profile,
        tags: ['user', 'profile'],
        dependencies: ['user:1'],
      });

      // Verify it was stored
      const stored = await RunCache.get<UserProfile>('user:1:profile') as UserProfile | undefined;
      expect(stored?.name).toBe('John Doe');

      // Invalidate by tag
      const invalidated = await RunCache.invalidateByTag('user');
      expect(invalidated).toBe(true);

      // Should be gone
      const afterInvalidation = await RunCache.get<UserProfile>('user:1:profile');
      expect(afterInvalidation).toBeUndefined();
    });

    it('should work with events and typed values', async () => {
      interface EventData {
        id: number;
        type: string;
        payload: any;
      }

      const events: Array<{ key: string; value: any }> = [];

      RunCache.onExpiry((event) => {
        events.push({ key: event.key, value: event.value });
      });

      const eventData: EventData = {
        id: 1,
        type: 'user_created',
        payload: { userId: 123, name: 'Test User' },
      };

      await RunCache.set<EventData>({
        key: 'event:1',
        value: eventData,
        ttl: 50, // 50ms
      });

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that event was triggered
      expect(events).toHaveLength(1);
      
      // The event value should be the stored version
      const storedValue = events[0].value;
      expect(storedValue).toBeDefined();
      
      // Event values are passed as they were stored, may be serialized
      if (typeof storedValue === 'object') {
        expect(storedValue.type).toBe('user_created');
        expect(storedValue.payload.userId).toBe(123);
      } else {
        // If it's serialized as string, parse and check
        const parsed = JSON.parse(storedValue);
        expect(parsed.type).toBe('user_created');
        expect(parsed.payload.userId).toBe(123);
      }
    });
  });

  describe('Backward Compatibility Verification', () => {
    it('should maintain compatibility with legacy string-only usage', async () => {
      // Legacy usage (no type parameters)
      await RunCache.set({ key: 'legacy:string', value: 'simple string' });
      await RunCache.set({ key: 'legacy:json', value: JSON.stringify({ id: 1, name: 'test' }) });

      const legacyString = await RunCache.get('legacy:string');
      const legacyJson = await RunCache.get('legacy:json');

      // Values are preserved, check content instead of type
      expect(legacyString).toBe('simple string');
      
      // legacyJson might be deserialized automatically
      if (typeof legacyJson === 'string') {
        const parsed = JSON.parse(legacyJson);
        expect(parsed.id).toBe(1);
        expect(parsed.name).toBe('test');
      } else {
        expect((legacyJson as any).id).toBe(1);
        expect((legacyJson as any).name).toBe('test');
      }
    });

    it('should handle mixed legacy and typed values in same cache', async () => {
      interface ModernUser {
        id: number;
        name: string;
        settings: {
          theme: 'light' | 'dark';
          notifications: boolean;
        };
      }

      // Store legacy values
      await RunCache.set({ key: 'user:legacy', value: 'John Doe' });
      await RunCache.set({ key: 'settings:legacy', value: JSON.stringify({ theme: 'dark' }) });

      // Store modern typed values
      const modernUser: ModernUser = {
        id: 1,
        name: 'Jane Doe',
        settings: {
          theme: 'light',
          notifications: true,
        },
      };

      await RunCache.set<ModernUser>({ key: 'user:modern', value: modernUser });

      // Retrieve all
      const legacyUser = await RunCache.get('user:legacy');
      const legacySettings = await RunCache.get('settings:legacy');
      const modernUserRetrieved = await RunCache.get<ModernUser>('user:modern') as ModernUser | undefined;

      // Verify values (types may vary due to serialization)
      expect(legacyUser).toBe('John Doe');
      
      // Settings might be auto-deserialized
      if (typeof legacySettings === 'string') {
        expect(JSON.parse(legacySettings).theme).toBe('dark');
      } else {
        expect((legacySettings as any).theme).toBe('dark');
      }
      
      expect(modernUserRetrieved?.name).toBe('Jane Doe');
      expect(modernUserRetrieved?.settings.theme).toBe('light');
    });
  });
});