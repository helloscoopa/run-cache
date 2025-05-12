import { EVENT, EventParam, RunCache, EvictionPolicy } from "./run-cache";
import { v4 as uuid } from "uuid";

describe("RunCache", () => {
  beforeEach(() => {
    jest.useFakeTimers();

    RunCache.flush();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();

    RunCache.clearEventListeners();
  });

  describe("set()", () => {
    it("should throw an error if the cache key or value is empty", async () => {
      await expect(() =>
        RunCache.set({ key: "", value: uuid() }),
      ).rejects.toThrow("Empty key");
      await expect(() =>
        RunCache.set({ key: uuid(), value: "" }),
      ).rejects.toThrow("`value` can't be empty without a `sourceFn`");
    });

    it("should throw an error when a negative ttl is provided", async () => {
      await expect(
        RunCache.set({
          key: uuid(),
          value: uuid(),
          ttl: -1,
        }),
      ).rejects.toThrow("`ttl` cannot be negative");
    });

    it("should throw an error when the source function throws an error", async () => {
      const key = uuid();

      const sourceFn = jest.fn(async () => {
        throw Error("Unexpected Error");
      });
      await expect(
        RunCache.set({
          key,
          sourceFn,
        }),
      ).rejects.toThrow(`Source function failed for key: '${key}'`);

      expect(sourceFn).toHaveBeenCalledTimes(1);
    });

    it("should throw an error when the autoRefetch: true while ttl is not provided", async () => {
      const key = uuid();

      const sourceFn = jest.fn(async () => uuid());

      await expect(
        RunCache.set({
          key,
          sourceFn,
          autoRefetch: true,
        }),
      ).rejects.toThrow("`autoRefetch` is not allowed without a `ttl`");

      expect(sourceFn).toHaveBeenCalledTimes(0);
    });

    it("should be able to set a value with source function successfully", async () => {
      const key = uuid();
      const value = uuid();

      const sourceFn = jest.fn(() => value);

      await RunCache.set({
        key,
        sourceFn,
      });

      await expect(RunCache.get(key)).resolves.toStrictEqual(value);

      expect(sourceFn).toHaveBeenCalledTimes(1);
    });

    it("should be able to set a value with source function, autoRefetch enabled successfully", async () => {
      const key = uuid();
      const value = uuid();

      const sourceFn = jest.fn(() => value);

      await RunCache.set({
        key,
        sourceFn,
        ttl: 100,
        autoRefetch: true,
      });
      await expect(RunCache.get(key)).resolves.toStrictEqual(value);

      jest.advanceTimersByTime(100);
      await Promise.resolve();

      expect(sourceFn).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(100);
      await Promise.resolve();

      expect(sourceFn).toHaveBeenCalledTimes(3);
    });

    it("should return true if the cache value set successfully", async () => {
      await expect(
        RunCache.set({ key: uuid(), value: uuid() }),
      ).resolves.toStrictEqual(true);
    });

    it("should return true if the cache set with a ttl and ttl is functioning properly", async () => {
      const key = uuid();
      const value = uuid();

      await expect(
        RunCache.set({ key, value, ttl: 100 }),
      ).resolves.toStrictEqual(true);
      await expect(RunCache.get(key)).resolves.toStrictEqual(value);

      jest.advanceTimersByTime(101);

      await expect(RunCache.get(key)).resolves.toBeUndefined();
    });
  });

  describe("get()", () => {
    it("should return undefined if the key is empty", async () => {
      await expect(RunCache.get("")).resolves.toBeUndefined();
    });

    it("should return undefined if the key is not found", async () => {
      await expect(RunCache.get(uuid())).resolves.toBeUndefined();
    });

    it("should return the value successfully if the cache is not expired", async () => {
      const key = uuid();
      const value = uuid();

      const sourceFn = jest.fn(() => value);

      await RunCache.set({
        key,
        sourceFn,
        ttl: 100,
      });

      await expect(RunCache.get(key)).resolves.toStrictEqual(value);

      expect(sourceFn).toHaveBeenCalledTimes(1);
    });

    it("should auto refetch and return the new value successfully", async () => {
      const key = uuid();
      let dynamicValue = uuid();

      const sourceFn = jest.fn(async () => dynamicValue);

      await RunCache.set({
        key,
        sourceFn,
        autoRefetch: true,
        ttl: 100,
      });

      expect(sourceFn).toHaveBeenCalledTimes(1);

      await expect(RunCache.get(key)).resolves.toStrictEqual(dynamicValue);

      dynamicValue = uuid();

      jest.advanceTimersByTime(101);

      await expect(RunCache.get(key)).resolves.toStrictEqual(dynamicValue);

      expect(sourceFn).toHaveBeenCalledTimes(2);
    });

    it("should return the value successfully", async () => {
      const key = uuid();
      const value = uuid();

      await RunCache.set({ key, value });
      await expect(RunCache.get(key)).resolves.toStrictEqual(value);
    });

    it("should return all matching values when using a wildcard key", async () => {
      const prefix = "user-";
      const keys = [
        `${prefix}${uuid()}`,
        `${prefix}${uuid()}`,
        `${prefix}${uuid()}`,
        `other-${uuid()}`
      ];
      const values = [uuid(), uuid(), uuid(), uuid()];

      // Set all keys
      for (let i = 0; i < keys.length; i++) {
        await RunCache.set({ key: keys[i], value: values[i] });
      }

      // Get all user-* keys
      const result = await RunCache.get(`${prefix}*`);
      
      expect(Array.isArray(result)).toBe(true);
      expect((result as string[]).length).toBe(3);
      
      // Verify each user-* value is included
      for (let i = 0; i < 3; i++) {
        expect((result as string[]).includes(values[i])).toBe(true);
      }
      
      // Make sure the other-* key value is not included
      expect((result as string[]).includes(values[3])).toBe(false);
    });

    it("should return undefined when using a wildcard with no matches", async () => {
      await RunCache.set({ key: "test-key", value: "test-value" });
      
      await expect(RunCache.get("nonexistent-*")).resolves.toBeUndefined();
    });

    it("should handle complex wildcard patterns correctly", async () => {
      // Set up hierarchical data
      await RunCache.set({ key: "user:1:profile", value: "Alice profile" });
      await RunCache.set({ key: "user:1:settings", value: "Alice settings" });
      await RunCache.set({ key: "user:2:profile", value: "Bob profile" });
      await RunCache.set({ key: "user:2:settings", value: "Bob settings" });
      await RunCache.set({ key: "admin:1:profile", value: "Admin profile" });
      
      // Get all user profiles
      const userProfiles = await RunCache.get("user:*:profile");
      expect(Array.isArray(userProfiles)).toBe(true);
      expect((userProfiles as string[]).length).toBe(2);
      expect((userProfiles as string[]).includes("Alice profile")).toBe(true);
      expect((userProfiles as string[]).includes("Bob profile")).toBe(true);
      
      // Get all user 1 data
      const user1Data = await RunCache.get("user:1:*");
      expect(Array.isArray(user1Data)).toBe(true);
      expect((user1Data as string[]).length).toBe(2);
      expect((user1Data as string[]).includes("Alice profile")).toBe(true);
      expect((user1Data as string[]).includes("Alice settings")).toBe(true);
      
      // Get all profile data
      const allProfiles = await RunCache.get("*:*:profile");
      expect(Array.isArray(allProfiles)).toBe(true);
      expect((allProfiles as string[]).length).toBe(3);
      expect((allProfiles as string[]).includes("Admin profile")).toBe(true);
    });
  });

  describe("delete()", () => {
    it("should return false if the operation failed", () => {
      expect(RunCache.delete("NonExistentKey")).toStrictEqual(false);
    });

    it("should return true if the value is successfully deleted", async () => {
      const key = uuid();
      const value = uuid();

      await RunCache.set({ key, value });
      expect(RunCache.delete(key)).toStrictEqual(true);
      await expect(RunCache.get(key)).resolves.toBeUndefined();
    });

    it("should delete all keys matching a wildcard pattern", async () => {
      const prefix = "test-";
      const keys = [
        `${prefix}1`,
        `${prefix}2`,
        `${prefix}3`,
        `other-key`,
      ];
      
      for (const key of keys) {
        await RunCache.set({ key, value: uuid() });
      }
      
      expect(RunCache.delete(`${prefix}*`)).toBe(true);
      
      // Check that all test-* keys are deleted
      for (let i = 0; i < 3; i++) {
        await expect(RunCache.get(keys[i])).resolves.toBeUndefined();
      }
      
      // Check that other-key is still there
      await expect(RunCache.get(keys[3])).resolves.not.toBeUndefined();
    });
    
    it("should return false when deleting a wildcard with no matches", async () => {
      await RunCache.set({ key: "test-key", value: "test-value" });
      
      expect(RunCache.delete("nonexistent-*")).toBe(false);
    });

    it("should handle complex wildcard patterns in delete operations", async () => {
      // Set up hierarchical data
      await RunCache.set({ key: "user:1:profile", value: "Alice profile" });
      await RunCache.set({ key: "user:1:settings", value: "Alice settings" });
      await RunCache.set({ key: "user:2:profile", value: "Bob profile" });
      await RunCache.set({ key: "user:2:settings", value: "Bob settings" });
      
      // Delete all profiles
      expect(RunCache.delete("*:*:profile")).toBe(true);
      
      // Verify profiles are deleted
      await expect(RunCache.get("user:1:profile")).resolves.toBeUndefined();
      await expect(RunCache.get("user:2:profile")).resolves.toBeUndefined();
      
      // Verify settings are still there
      await expect(RunCache.get("user:1:settings")).resolves.toBe("Alice settings");
      await expect(RunCache.get("user:2:settings")).resolves.toBe("Bob settings");
    });
  });

  describe("flush()", () => {
    it("should clear all values", async () => {
      const key1 = uuid();
      const key2 = uuid();
      const value1 = uuid();
      const value2 = uuid();

      await RunCache.set({ key: key1, value: value1 });
      await RunCache.set({ key: key2, value: value2 });
      RunCache.flush();
      await expect(RunCache.get(key1)).resolves.toBeUndefined();
      await expect(RunCache.get(key2)).resolves.toBeUndefined();
    });
  });

  describe("has()", () => {
    it("should return true if the key exists", async () => {
      const key = uuid();
      const value = uuid();

      await RunCache.set({ key, value });
      await expect(RunCache.has(key)).resolves.toStrictEqual(true);
    });

    it("should return false if the key does not exist", async () => {
      await expect(RunCache.has("NonExistentKey")).resolves.toStrictEqual(
        false,
      );
    });

    it("should return false after ttl expiry", async () => {
      const key = uuid();
      const value = uuid();

      await RunCache.set({ key, value, ttl: 100 });
      await expect(RunCache.has(key)).resolves.toStrictEqual(true);

      jest.advanceTimersByTime(101);

      await expect(RunCache.has(key)).resolves.toStrictEqual(false);
    });

    it("should return true if any key matching the wildcard pattern exists", async () => {
      const prefix = "user-";
      await RunCache.set({ key: `${prefix}1`, value: "value1" });
      await RunCache.set({ key: `${prefix}2`, value: "value2" });
      
      await expect(RunCache.has(`${prefix}*`)).resolves.toBe(true);
    });
    
    it("should return false if no key matching the wildcard pattern exists", async () => {
      await RunCache.set({ key: "test-key", value: "test-value" });
      
      await expect(RunCache.has("nonexistent-*")).resolves.toBe(false);
    });
  });

  describe("refetch()", () => {
    it("should resolve to false if refetch is called on a key having no source function", async () => {
      const key = uuid();

      await RunCache.set({ key, value: uuid() });
      await expect(RunCache.refetch(key)).resolves.toStrictEqual(false);
    });

    it("should throw an error when the source function throws an error", async () => {
      const key = uuid();
      let shouldThrowError = false;

      const sourceFn = jest.fn(async () => {
        if (shouldThrowError) {
          throw Error("Unexpected Error");
        } else {
          return "SomeValue";
        }
      });
      await RunCache.set({ key, sourceFn });

      expect(sourceFn).toHaveBeenCalledTimes(1);

      // Make source function to fail
      shouldThrowError = true;

      expect(RunCache.refetch(key)).rejects.toThrow(
        `Source function failed for key: '${key}'`,
      );

      expect(sourceFn).toHaveBeenCalledTimes(2);
    });

    it("should not refetch if the key does not exist", async () => {
      await expect(RunCache.refetch("NonExistentKey")).resolves.toStrictEqual(
        false,
      );
    });

    it("should not call sourceFn more than once at a time", async () => {
      const key = uuid();

      const sourceFn = jest.fn(async () => {
        return uuid();
      });

      await RunCache.set({ key, value: uuid(), sourceFn });

      const [firstRefetch, secondRefetch, thirdRefetch] = await Promise.all([
        RunCache.refetch(key),
        RunCache.refetch(key),
        RunCache.refetch(key),
      ]);

      expect(firstRefetch).toStrictEqual(true);
      expect(secondRefetch).toStrictEqual(false);
      expect(thirdRefetch).toStrictEqual(false);

      expect(sourceFn).toHaveBeenCalledTimes(1);
    });

    it("should refetch and update the value from the source function", async () => {
      const key = uuid();
      let dynamicValue = uuid();
      const sourceFn = jest.fn(() => dynamicValue);

      await RunCache.set({ key, sourceFn });
      await expect(RunCache.get(key)).resolves.toStrictEqual(dynamicValue);

      expect(sourceFn).toHaveBeenCalledTimes(1);

      dynamicValue = uuid();

      await RunCache.refetch(key);

      expect(sourceFn).toHaveBeenCalledTimes(2);

      await expect(RunCache.get(key)).resolves.toStrictEqual(dynamicValue);
    });

    it("should refetch all keys matching a wildcard pattern", async () => {
      const prefix = "test-";
      let values = [uuid(), uuid(), uuid()];
      const keys = [`${prefix}1`, `${prefix}2`, `${prefix}3`];
      
      const sourceFns = keys.map((_, i) => {
        return jest.fn(() => values[i]);
      });
      
      // Set up initial cache entries
      for (let i = 0; i < keys.length; i++) {
        await RunCache.set({ 
          key: keys[i], 
          sourceFn: sourceFns[i]
        });
      }
      
      // Verify each source function was called once during setup
      sourceFns.forEach(fn => expect(fn).toHaveBeenCalledTimes(1));
      
      // Change the values that will be returned by the source functions
      values = [uuid(), uuid(), uuid()];
      
      // Refetch all matching keys
      const result = await RunCache.refetch(`${prefix}*`);
      expect(result).toBe(true);
      
      // Verify each source function was called again
      sourceFns.forEach(fn => expect(fn).toHaveBeenCalledTimes(2));
      
      // Verify the values were updated
      for (let i = 0; i < keys.length; i++) {
        await expect(RunCache.get(keys[i])).resolves.toBe(values[i]);
      }
    });
    
    it("should return false when refetching a wildcard with no matches", async () => {
      await expect(RunCache.refetch("nonexistent-*")).resolves.toBe(false);
    });
  });

  describe("onExpire() and onKeyExpiry()", () => {
    it("should trigger after ttl expiry", async () => {
      const key = uuid();
      const value = uuid();

      const funcToBeExecutedOnExpiry = jest.fn(
        async (cacheState: EventParam) => {
          expect(cacheState.key).toStrictEqual(key);
          expect(cacheState.value).toStrictEqual(value);
          expect(cacheState.ttl).toStrictEqual(100);
        },
      );

      RunCache.onExpiry(funcToBeExecutedOnExpiry);
      RunCache.onKeyExpiry(key, funcToBeExecutedOnExpiry);

      RunCache.set({
        key,
        value: value,
        ttl: 100,
      });

      jest.advanceTimersByTime(101);
      await Promise.resolve(); // Flush microtasks

      expect(funcToBeExecutedOnExpiry).toHaveBeenCalledTimes(2);
    });

    it("should trigger for wildcards when a matching key expires", async () => {
      const prefix = "user-";
      const keys = [`${prefix}1`, `${prefix}2`];
      const values = ["value1", "value2"];
      
      const wildcardCallback = jest.fn();
      
      // Set up event listener with wildcard
      RunCache.onKeyExpiry(`${prefix}*`, wildcardCallback);
      
      // Set cache entries with TTL
      for (let i = 0; i < keys.length; i++) {
        await RunCache.set({
          key: keys[i],
          value: values[i],
          ttl: 100
        });
      }
      
      // Advance time to trigger expiry
      jest.advanceTimersByTime(101);
      await Promise.resolve(); // Flush microtasks
      
      // Check that the callback was triggered for both keys
      expect(wildcardCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe("onRefetch() and onKeyRefetch()", () => {
    it("should trigger on refetch", async () => {
      const key = uuid();
      let dynamicValue = uuid();

      const funcToBeExecutedOnRefetch = jest.fn((cacheState: EventParam) => {
        expect(cacheState.key).toStrictEqual(key);
        expect(cacheState.value).toStrictEqual(dynamicValue);
        expect(cacheState.ttl).toStrictEqual(100);
      });

      const sourceFn = jest.fn(() => dynamicValue);

      RunCache.onRefetch(funcToBeExecutedOnRefetch);
      RunCache.onKeyRefetch(key, funcToBeExecutedOnRefetch);

      await RunCache.set({
        key,
        sourceFn,
        ttl: 100,
        autoRefetch: true,
      });

      dynamicValue = uuid();

      jest.advanceTimersByTime(101);

      await Promise.resolve(); // Flush microtasks

      expect(sourceFn).toHaveBeenCalledTimes(2);
      expect(funcToBeExecutedOnRefetch).toHaveBeenCalledTimes(2);
    });

    it("should trigger for wildcards when a matching key is refetched", async () => {
      const prefix = "user-";
      const keys = [`${prefix}1`, `${prefix}2`];
      let values = ["value1", "value2"];
      
      const wildcardCallback = jest.fn();
      
      // Set up event listener with wildcard
      RunCache.onKeyRefetch(`${prefix}*`, wildcardCallback);
      
      // Create source functions that update values on refetch
      const sourceFns = keys.map((_, i) => {
        return jest.fn(() => values[i]);
      });
      
      // Set cache entries with auto-refetch
      for (let i = 0; i < keys.length; i++) {
        await RunCache.set({
          key: keys[i],
          sourceFn: sourceFns[i],
          ttl: 100,
          autoRefetch: true
        });
      }
      
      // Update values to be returned on refetch
      values = ["newValue1", "newValue2"];
      
      // Advance time to trigger auto-refetch
      jest.advanceTimersByTime(101);
      await Promise.resolve(); // Flush microtasks
      
      // Check that the callback was triggered for both keys
      expect(wildcardCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe("onRefetchFailure() and onKeyRefetchFailure()", () => {
    it("should trigger if the sourceFn fails", async () => {
      const key = uuid();
      const value = uuid();

      let breaker = false;

      const funcToBeExecutedOnRefetchFailure = jest.fn(
        (cacheState: EventParam) => {
          expect(cacheState.key).toStrictEqual(key);
          expect(cacheState.value).toStrictEqual(value);
          expect(cacheState.ttl).toStrictEqual(100);
        },
      );

      const sourceFn = jest.fn(() => {
        if (breaker) {
          throw Error("Simulated source function failure");
        } else {
          return uuid();
        }
      });

      RunCache.onRefetchFailure(funcToBeExecutedOnRefetchFailure);
      RunCache.onKeyRefetchFailure(key, funcToBeExecutedOnRefetchFailure);

      await RunCache.set({
        key,
        value,
        sourceFn,
        ttl: 100,
        autoRefetch: true,
      });

      breaker = true;

      jest.advanceTimersByTime(101);

      await Promise.resolve(); // Flush microtasks

      expect(sourceFn).toHaveBeenCalledTimes(1);
      expect(funcToBeExecutedOnRefetchFailure).toHaveBeenCalledTimes(2);
    });

    it("should trigger for wildcards when a matching key fails to refetch", async () => {
      const prefix = "user-";
      const keys = [`${prefix}1`, `${prefix}2`];
      
      const wildcardCallback = jest.fn();
      
      // Set up event listener with wildcard
      RunCache.onKeyRefetchFailure(`${prefix}*`, wildcardCallback);
      
      // Create source functions that will fail on refetch
      const sourceFns = keys.map((key) => {
        let firstCall = true;
        return jest.fn(() => {
          if (firstCall) {
            firstCall = false;
            return `initial-${key}`;
          }
          throw new Error("Simulated source function failure");
        });
      });
      
      // Set cache entries with auto-refetch
      for (let i = 0; i < keys.length; i++) {
        await RunCache.set({
          key: keys[i],
          sourceFn: sourceFns[i],
          ttl: 100,
          autoRefetch: true
        });
      }
      
      // Advance time to trigger auto-refetch failures
      jest.advanceTimersByTime(101);
      await Promise.resolve(); // Flush microtasks
      
      // Check that the callback was triggered for both keys
      expect(wildcardCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe("clearEventListeners()", () => {
    it("should cancel existing all listeners", async () => {
      const key = uuid();

      const funcToBeExecutedOnRefetch = jest.fn();
      const funcToBeExecutedOnExpiry = jest.fn();

      const sourceFn = jest.fn(() => "value");

      RunCache.onRefetch(funcToBeExecutedOnRefetch);
      RunCache.onKeyRefetch(key, funcToBeExecutedOnRefetch);

      RunCache.onExpiry(funcToBeExecutedOnExpiry);
      RunCache.onKeyExpiry(key, funcToBeExecutedOnExpiry);

      await RunCache.set({
        key,
        sourceFn,
        ttl: 100,
        autoRefetch: true,
      });

      const eventsCleared = RunCache.clearEventListeners();
      expect(eventsCleared).toBeTruthy();

      jest.advanceTimersByTime(101);
      await Promise.resolve(); // Flush microtasks

      expect(sourceFn).toHaveBeenCalledTimes(2);
      expect(funcToBeExecutedOnExpiry).toHaveBeenCalledTimes(0);
      expect(funcToBeExecutedOnRefetch).toHaveBeenCalledTimes(0);
    });

    it("should cancel existing listeners for a specific event", async () => {
      const key = uuid();

      const funcToBeExecutedOnRefetch = jest.fn();
      const funcToBeExecutedOnExpiry = jest.fn();

      const sourceFn = jest.fn(() => uuid());

      RunCache.onRefetch(funcToBeExecutedOnRefetch);
      RunCache.onKeyRefetch(key, funcToBeExecutedOnRefetch);

      RunCache.onExpiry(funcToBeExecutedOnExpiry);
      RunCache.onKeyExpiry(key, funcToBeExecutedOnExpiry);

      await RunCache.set({
        key,
        sourceFn,
        ttl: 100,
        autoRefetch: true,
      });

      const eventsCleared = RunCache.clearEventListeners({
        event: EVENT.EXPIRE,
      });
      expect(eventsCleared).toBeTruthy();

      jest.advanceTimersByTime(101);
      await Promise.resolve(); // Flush microtasks

      expect(sourceFn).toHaveBeenCalledTimes(2);
      expect(funcToBeExecutedOnExpiry).toHaveBeenCalledTimes(0);
      expect(funcToBeExecutedOnRefetch).toHaveBeenCalledTimes(2);
    });

    it("should cancel existing listeners for a specific event key", async () => {
      const key = uuid();

      const funcToBeExecutedOnRefetch = jest.fn();
      const funcToBeExecutedOnExpiry = jest.fn();

      const sourceFn = jest.fn(() => uuid());

      RunCache.onRefetch(funcToBeExecutedOnRefetch);
      RunCache.onKeyRefetch(key, funcToBeExecutedOnRefetch);

      RunCache.onExpiry(funcToBeExecutedOnExpiry);
      RunCache.onKeyExpiry(key, funcToBeExecutedOnExpiry);

      const eventsCleared = RunCache.clearEventListeners({
        event: EVENT.EXPIRE,
        key,
      });
      expect(eventsCleared).toBeTruthy();

      await RunCache.set({
        key,
        sourceFn,
        ttl: 100,
        autoRefetch: true,
      });

      jest.advanceTimersByTime(101);
      await Promise.resolve(); // Flush microtasks

      expect(sourceFn).toHaveBeenCalledTimes(2);
      expect(funcToBeExecutedOnExpiry).toHaveBeenCalledTimes(1);
      expect(funcToBeExecutedOnRefetch).toHaveBeenCalledTimes(2);
    });

    it("should clear event listeners using wildcard patterns", async () => {
      const prefix = "user-";
      const keys = [`${prefix}1`, `${prefix}2`, `${prefix}3`];
      
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      // Set up event listeners for each key
      for (const key of keys) {
        RunCache.onKeyExpiry(key, callback1);
        RunCache.onKeyRefetch(key, callback2);
      }
      
      // Set cache entries with TTL
      for (const key of keys) {
        await RunCache.set({
          key,
          value: `value-${key}`,
          ttl: 100,
          sourceFn: () => `refetched-${key}`,
          autoRefetch: true
        });
      }
      
      // Clear all expire events for user-* keys
      const eventsCleared = RunCache.clearEventListeners({
        event: EVENT.EXPIRE,
        key: `${prefix}*`
      });
      
      expect(eventsCleared).toBeTruthy();
      
      // Advance time to trigger events
      jest.advanceTimersByTime(101);
      await Promise.resolve(); // Flush microtasks
      
      // Expire callbacks should not be called
      expect(callback1).toHaveBeenCalledTimes(0);
      
      // Refetch callbacks should still be called
      expect(callback2).toHaveBeenCalledTimes(3);
    });

    it("should properly clean up wildcard pattern listeners", async () => {
      // Setup: create a prefix to use for all keys
      const prefix = "test-cleanup-";
      const wildcardPattern = `${prefix}*`;
      
      // Create some test keys
      await RunCache.set({ key: `${prefix}1`, value: "Value 1", ttl: 100 });
      await RunCache.set({ key: `${prefix}2`, value: "Value 2", ttl: 100 });
      
      // Create counters to track callback executions
      let expiryCount = 0;
      let refetchCount = 0;
      let refetchFailCount = 0;
      
      // Set up wildcard listeners
      RunCache.onKeyExpiry(wildcardPattern, () => { expiryCount++; });
      RunCache.onKeyRefetch(wildcardPattern, () => { refetchCount++; });
      RunCache.onKeyRefetchFailure(wildcardPattern, () => { refetchFailCount++; });

      // Trigger expiry events
      jest.advanceTimersByTime(101);
      await Promise.resolve(); // Flush microtasks
      
      // Verify listeners were triggered
      expect(expiryCount).toBe(2); // Both keys expired
      
      // Reset counters
      expiryCount = 0;
      
      // Add new keys that should trigger the same wildcards
      await RunCache.set({ key: `${prefix}3`, value: "Value 3", ttl: 100 });
      await RunCache.set({ key: `${prefix}4`, value: "Value 4", ttl: 100 });
      
      // Clear the wildcard listeners for expiry events
      RunCache.clearEventListeners({
        event: EVENT.EXPIRE,
        key: wildcardPattern
      });
      
      // Trigger expiry events again
      jest.advanceTimersByTime(101);
      await Promise.resolve(); // Flush microtasks
      
      // Verify the expiry listeners were NOT triggered (they were cleared)
      expect(expiryCount).toBe(0);
      
      // Test clearing specific event wildcards doesn't affect others
      // Set up a source function that will fail for refetch
      const errorFn = jest.fn(() => {
        throw new Error("Intentional error for testing");
      });
      
      await RunCache.set({ 
        key: `${prefix}5`, 
        value: "Value 5", 
        sourceFn: errorFn,
        ttl: 100,
        autoRefetch: true
      });
      
      // Trigger a refetch failure
      jest.advanceTimersByTime(101);
      await Promise.resolve(); // Flush microtasks
      
      // Verify refetch failure was triggered (this listener wasn't cleared)
      expect(refetchFailCount).toBeGreaterThan(0);
      
      // Now clear all remaining listeners
      RunCache.clearEventListeners();
      
      // Reset counters again
      refetchCount = 0;
      refetchFailCount = 0;
      
      // Add another key that would trigger callbacks if they existed
      await RunCache.set({ 
        key: `${prefix}6`, 
        value: "Value 6", 
        sourceFn: errorFn,
        ttl: 100,
        autoRefetch: true
      });
      
      // Trigger events
      jest.advanceTimersByTime(101);
      await Promise.resolve(); // Flush microtasks
      
      // Verify no listeners were triggered
      expect(refetchCount).toBe(0);
      expect(refetchFailCount).toBe(0);
    });
  });

  describe("wildcard pattern matching", () => {
    beforeEach(async () => {
      // Set up test data with hierarchical keys
      await RunCache.set({ key: "app:user:1", value: "User 1 data" });
      await RunCache.set({ key: "app:user:2", value: "User 2 data" });
      await RunCache.set({ key: "app:admin:1", value: "Admin 1 data" });
      await RunCache.set({ key: "app:config:global", value: "Global config" });
      await RunCache.set({ key: "app:config:local", value: "Local config" });
      await RunCache.set({ key: "backup:user:1", value: "User 1 backup" });
    });

    it("should handle wildcards at beginning of pattern", async () => {
      const results = await RunCache.get("*:user:*");
      expect(Array.isArray(results)).toBe(true);
      expect((results as string[]).length).toBe(3);
      expect((results as string[]).includes("User 1 data")).toBe(true);
      expect((results as string[]).includes("User 2 data")).toBe(true);
      expect((results as string[]).includes("User 1 backup")).toBe(true);
    });

    it("should handle wildcards in middle of pattern", async () => {
      const results = await RunCache.get("app:*:1");
      expect(Array.isArray(results)).toBe(true);
      expect((results as string[]).length).toBe(2);
      expect((results as string[]).includes("User 1 data")).toBe(true);
      expect((results as string[]).includes("Admin 1 data")).toBe(true);
    });

    it("should handle multiple wildcards in pattern", async () => {
      const results = await RunCache.get("*:*:1");
      expect(Array.isArray(results)).toBe(true);
      expect((results as string[]).length).toBe(3);
      expect((results as string[]).includes("User 1 data")).toBe(true);
      expect((results as string[]).includes("Admin 1 data")).toBe(true);
      expect((results as string[]).includes("User 1 backup")).toBe(true);
    });

    it("should handle wildcards with refetch operations", async () => {
      let values: Record<string, string> = {
        "data:1": "Original 1",
        "data:2": "Original 2",
        "other:1": "Other 1"
      };
      
      // Set up with source functions
      const sourceFns = Object.keys(values).map(key => {
        return jest.fn(() => values[key]);
      });
      
      let i = 0;
      for (const key of Object.keys(values)) {
        await RunCache.set({
          key,
          sourceFn: sourceFns[i++]
        });
      }
      
      // Update the values that will be returned
      values = {
        "data:1": "Updated 1",
        "data:2": "Updated 2",
        "other:1": "Updated Other 1"
      };
      
      // Refetch all data: keys
      await RunCache.refetch("data:*");
      
      // Check data keys were updated
      await expect(RunCache.get("data:1")).resolves.toBe("Updated 1");
      await expect(RunCache.get("data:2")).resolves.toBe("Updated 2");
      
      // Check other key was not updated - it should still have the original value
      await expect(RunCache.get("other:1")).resolves.toBe("Other 1");
      
      // Check source functions were called correctly
      expect(sourceFns[0]).toHaveBeenCalledTimes(2); // Once for set, once for refetch
      expect(sourceFns[1]).toHaveBeenCalledTimes(2); // Once for set, once for refetch
      expect(sourceFns[2]).toHaveBeenCalledTimes(1); // Once for set only
    });

    it("should handle pattern matching with special characters", async () => {
      // Set up keys with various separators but not regex special chars
      await RunCache.set({ key: "key-with-dash", value: "Dash value" });
      await RunCache.set({ key: "key.with.dots", value: "Dot value" });
      await RunCache.set({ key: "key_with_underscores", value: "Underscore value" });
      
      // Test pattern matching with these characters
      const dashResult = await RunCache.get("key-with*");
      expect(Array.isArray(dashResult)).toBe(true);
      expect((dashResult as string[]).includes("Dash value")).toBe(true);
      
      const dotResult = await RunCache.get("key.with*");
      expect(Array.isArray(dotResult)).toBe(true);
      expect((dotResult as string[]).includes("Dot value")).toBe(true);
      
      const underscoreResult = await RunCache.get("key_with*");
      expect(Array.isArray(underscoreResult)).toBe(true);
      expect((underscoreResult as string[]).includes("Underscore value")).toBe(true);
    });

    it("should understand pattern matching limitations", async () => {
      // The current implementation treats any key with * as a pattern
      // So we can test keys with literals and understand the limitations
      
      // Set a key with a literal asterisk in the name
      await RunCache.set({ key: "key-with-asterisk*", value: "Asterisk key value" });
      
      // When we try to get this exact key, it will be treated as a pattern
      const result = await RunCache.get("key-with-asterisk*");
      expect(Array.isArray(result)).toBe(true);
      expect((result as string[]).includes("Asterisk key value")).toBe(true);
      
      // This is the current behavior - we can't distinguish between 
      // literal * and wildcards in the current implementation
    });

    it("should properly escape regex metacharacters in patterns", async () => {
      // Set up keys with regex special characters
      await RunCache.set({ key: "user.profile", value: "User profile" });
      await RunCache.set({ key: "user+settings", value: "User settings" });
      await RunCache.set({ key: "user(admin)", value: "Admin user" });
      await RunCache.set({ key: "user[test]", value: "Test user" });
      
      // Test with literal dot in pattern
      const dotPattern = await RunCache.get("user.*");
      expect(Array.isArray(dotPattern)).toBe(true);
      expect((dotPattern as string[]).length).toBe(1);
      expect((dotPattern as string[]).includes("User profile")).toBe(true);
      
      // Test with literal plus in pattern
      const plusPattern = await RunCache.get("user+*");
      expect(Array.isArray(plusPattern)).toBe(true);
      expect((plusPattern as string[]).length).toBe(1);
      expect((plusPattern as string[]).includes("User settings")).toBe(true);
      
      // Test with literal parentheses in pattern
      const parenPattern = await RunCache.get("user(*");
      expect(Array.isArray(parenPattern)).toBe(true);
      expect((parenPattern as string[]).length).toBe(1);
      expect((parenPattern as string[]).includes("Admin user")).toBe(true);
      
      // Test with literal brackets in pattern
      const bracketPattern = await RunCache.get("user[*");
      expect(Array.isArray(bracketPattern)).toBe(true);
      expect((bracketPattern as string[]).length).toBe(1);
      expect((bracketPattern as string[]).includes("Test user")).toBe(true);
    });

    it("should handle multiple metacharacters and wildcards together", async () => {
      // Set up a key with multiple special characters
      await RunCache.set({ key: "complex.key[with](special)+chars", value: "Complex key value" });
      
      // Test with a complex pattern containing both wildcards and special characters
      const result = await RunCache.get("complex.key[with]*chars");
      expect(Array.isArray(result)).toBe(true);
      expect((result as string[]).includes("Complex key value")).toBe(true);
    });
  });

  describe("eviction policies", () => {
    beforeEach(() => {
      // Reset configuration to default before each test
      RunCache.configure({
        maxSize: Infinity,
        evictionPolicy: EvictionPolicy.NONE
      });
      RunCache.flush();
    });

    it("should not evict entries when max size isn't reached", async () => {
      // Configure cache with LRU policy and max size of 5
      RunCache.configure({
        maxSize: 5,
        evictionPolicy: EvictionPolicy.LRU
      });

      // Add 3 entries (below the max size)
      await RunCache.set({ key: "key1", value: "value1" });
      await RunCache.set({ key: "key2", value: "value2" });
      await RunCache.set({ key: "key3", value: "value3" });

      // Check all entries are still in the cache
      await expect(RunCache.get("key1")).resolves.toBe("value1");
      await expect(RunCache.get("key2")).resolves.toBe("value2");
      await expect(RunCache.get("key3")).resolves.toBe("value3");
    });

    it("should evict LRU entries when max size is reached", async () => {
      // Configure cache with LRU policy and max size of 3
      RunCache.configure({
        maxSize: 3,
        evictionPolicy: EvictionPolicy.LRU
      });

      // Add 3 entries (at the max size)
      await RunCache.set({ key: "key1", value: "value1" });
      await RunCache.set({ key: "key2", value: "value2" });
      await RunCache.set({ key: "key3", value: "value3" });

      // Access key1 and key3 to make key2 the least recently used
      await RunCache.get("key1");
      await RunCache.get("key3");

      // Add another entry to trigger eviction
      await RunCache.set({ key: "key4", value: "value4" });

      // Check that key2 was evicted (it was least recently used)
      await expect(RunCache.get("key2")).resolves.toBeUndefined();
      
      // Check that other keys remain
      await expect(RunCache.get("key1")).resolves.toBe("value1");
      await expect(RunCache.get("key3")).resolves.toBe("value3");
      await expect(RunCache.get("key4")).resolves.toBe("value4");
    });

    it("should evict LFU entries when max size is reached", async () => {
      // Configure cache with LFU policy and max size of 3
      RunCache.configure({
        maxSize: 3,
        evictionPolicy: EvictionPolicy.LFU
      });

      // Add 3 entries (at the max size)
      await RunCache.set({ key: "key1", value: "value1" });
      await RunCache.set({ key: "key2", value: "value2" });
      await RunCache.set({ key: "key3", value: "value3" });

      // Access key1 three times and key3 two times to make key2 the least frequently used
      await RunCache.get("key1");
      await RunCache.get("key1");
      await RunCache.get("key1");
      await RunCache.get("key3");
      await RunCache.get("key3");

      // Add another entry to trigger eviction
      await RunCache.set({ key: "key4", value: "value4" });

      // Check that key2 was evicted (it was least frequently used)
      await expect(RunCache.get("key2")).resolves.toBeUndefined();
      
      // Check that other keys remain
      await expect(RunCache.get("key1")).resolves.toBe("value1");
      await expect(RunCache.get("key3")).resolves.toBe("value3");
      await expect(RunCache.get("key4")).resolves.toBe("value4");
    });

    it("should evict LFU entries with same frequency based on recency", async () => {
      // Configure cache with LFU policy and max size of 3
      RunCache.configure({
        maxSize: 3,
        evictionPolicy: EvictionPolicy.LFU
      });

      // Add 3 entries (at the max size)
      await RunCache.set({ key: "key1", value: "value1" });
      await RunCache.set({ key: "key2", value: "value2" });
      await RunCache.set({ key: "key3", value: "value3" });

      // Access all keys once to make their access count equal
      await RunCache.get("key1");
      await RunCache.get("key2");
      await RunCache.get("key3");

      // Add another entry to trigger eviction (key1 should be evicted as it's the oldest)
      await RunCache.set({ key: "key4", value: "value4" });

      // Check that key1 was evicted (it had same frequency but was least recently used)
      await expect(RunCache.get("key1")).resolves.toBeUndefined();
      
      // Check that other keys remain
      await expect(RunCache.get("key2")).resolves.toBe("value2");
      await expect(RunCache.get("key3")).resolves.toBe("value3");
      await expect(RunCache.get("key4")).resolves.toBe("value4");
    });

    it("should not evict anything with eviction policy set to NONE", async () => {
      // Configure cache with no eviction policy and max size of 3
      RunCache.configure({
        maxSize: 3,
        evictionPolicy: EvictionPolicy.NONE
      });

      // Add 5 entries (exceeding max size)
      await RunCache.set({ key: "key1", value: "value1" });
      await RunCache.set({ key: "key2", value: "value2" });
      await RunCache.set({ key: "key3", value: "value3" });
      await RunCache.set({ key: "key4", value: "value4" });
      await RunCache.set({ key: "key5", value: "value5" });

      // Check that no entries were evicted despite exceeding max size
      await expect(RunCache.get("key1")).resolves.toBe("value1");
      await expect(RunCache.get("key2")).resolves.toBe("value2");
      await expect(RunCache.get("key3")).resolves.toBe("value3");
      await expect(RunCache.get("key4")).resolves.toBe("value4");
      await expect(RunCache.get("key5")).resolves.toBe("value5");
    });

    it("should correctly update configuration", async () => {
      // Check initial configuration
      expect(RunCache.getConfig()).toEqual({
        maxSize: Infinity,
        evictionPolicy: EvictionPolicy.NONE
      });
      
      // Update configuration
      RunCache.configure({
        maxSize: 10,
        evictionPolicy: EvictionPolicy.LRU
      });
      
      // Check updated configuration
      expect(RunCache.getConfig()).toEqual({
        maxSize: 10,
        evictionPolicy: EvictionPolicy.LRU
      });
      
      // Partial update
      RunCache.configure({
        evictionPolicy: EvictionPolicy.LFU
      });
      
      // Check that only the specified field was updated
      expect(RunCache.getConfig()).toEqual({
        maxSize: 10,
        evictionPolicy: EvictionPolicy.LFU
      });
    });
  });
});
