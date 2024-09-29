import { EVENT, EventParam, RunCache } from "./run-cache";
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

      expect(sourceFn).toHaveBeenCalledTimes(2);
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
  });
});
