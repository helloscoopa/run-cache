import { EVENT, EventParam, RunCache } from "./run-cache";
import { v4 as uuid } from "uuid";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RunCache", () => {
  beforeEach(() => {
    jest.useFakeTimers();

    RunCache.deleteAll();
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
      expect(await RunCache.get(key)).toStrictEqual(JSON.stringify(value));

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
      expect(await RunCache.get(key)).toStrictEqual(JSON.stringify(value));

      expect(sourceFn).toHaveBeenCalledTimes(1);
    });

    it("should return true if the cache value set successfully", async () => {
      expect(await RunCache.set({ key: uuid(), value: uuid() })).toStrictEqual(
        true,
      );
    });

    it("should return true if the cache set with a ttl and ttl is functioning properly", async () => {
      const key = uuid();
      const value = uuid();

      expect(await RunCache.set({ key, value, ttl: 100 })).toStrictEqual(true);
      expect(await RunCache.get(key)).toStrictEqual(JSON.stringify(value));

      jest.advanceTimersByTime(101);

      expect(await RunCache.get(key)).toBeUndefined();
    });
  });

  describe("get()", () => {
    it("should return undefined if the key is empty", async () => {
      expect(await RunCache.get("")).toBeUndefined();
    });

    it("should return undefined if the key is not found", async () => {
      expect(await RunCache.get(uuid())).toBeUndefined();
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

      expect(await RunCache.get(key)).toStrictEqual(JSON.stringify(value));

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

      expect(await RunCache.get(key)).toStrictEqual(
        JSON.stringify(dynamicValue),
      );

      dynamicValue = uuid();

      jest.advanceTimersByTime(101);

      expect(await RunCache.get(key)).toStrictEqual(
        JSON.stringify(dynamicValue),
      );

      expect(sourceFn).toHaveBeenCalledTimes(2);
    });

    it("should return the value successfully", async () => {
      const key = uuid();
      const value = uuid();

      RunCache.set({ key, value });
      expect(await RunCache.get(key)).toStrictEqual(JSON.stringify(value));
    });
  });

  describe("delete()", () => {
    it("should return false if the operation failed", () => {
      expect(RunCache.delete("NonExistentKey")).toStrictEqual(false);
    });

    it("should return true if the value is successfully deleted", async () => {
      const key = uuid();
      const value = uuid();

      RunCache.set({ key, value });
      expect(RunCache.delete(key)).toStrictEqual(true);
      expect(await RunCache.get(key)).toBeUndefined();
    });
  });

  describe("deleteAll()", () => {
    it("should clear all values", async () => {
      const key1 = uuid();
      const key2 = uuid();
      const value1 = uuid();
      const value2 = uuid();

      RunCache.set({ key: key1, value: value1 });
      RunCache.set({ key: key2, value: value2 });
      RunCache.deleteAll();
      expect(await RunCache.get(key1)).toBeUndefined();
      expect(await RunCache.get(key2)).toBeUndefined();
    });
  });

  describe("has()", () => {
    it("should return true if the key exists", async () => {
      const key = uuid();
      const value = uuid();

      RunCache.set({ key, value });
      expect(await RunCache.has(key)).toStrictEqual(true);
    });

    it("should return false if the key does not exist", async () => {
      expect(await RunCache.has("NonExistentKey")).toStrictEqual(false);
    });

    it("should return false after ttl expiry", async () => {
      const key = uuid();
      const value = uuid();

      RunCache.set({ key, value, ttl: 100 });
      expect(await RunCache.has(key)).toStrictEqual(true);

      jest.advanceTimersByTime(101);

      expect(await RunCache.has(key)).toStrictEqual(false);
    });
  });

  describe("refetch()", () => {
    it("should throw an error if refetch is called on a key having no source function", async () => {
      const key = uuid();

      RunCache.set({ key, value: uuid() });
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
      jest.useRealTimers();

      const key = uuid();

      const sourceFn = jest.fn(async () => {
        await sleep(10);
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
      expect(await RunCache.get(key)).toStrictEqual(
        JSON.stringify(dynamicValue),
      );

      expect(sourceFn).toHaveBeenCalledTimes(1);

      dynamicValue = uuid();

      await RunCache.refetch(key);

      expect(sourceFn).toHaveBeenCalledTimes(2);

      expect(await RunCache.get(key)).toStrictEqual(
        JSON.stringify(dynamicValue),
      );
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
      jest.useFakeTimers();

      const key = uuid();

      let dynamicValue = uuid();

      const funcToBeExecutedOnRefetch = jest.fn((cacheState: EventParam) => {
        expect(cacheState.key).toStrictEqual(key);
        expect(cacheState.value).toStrictEqual(JSON.stringify(dynamicValue));
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
      jest.useFakeTimers();

      const key = uuid();
      const value = uuid();

      let breaker = false;

      const funcToBeExecutedOnRefetchFailure = jest.fn(
        (cacheState: EventParam) => {
          expect(cacheState.key).toStrictEqual(key);
          expect(cacheState.value).toStrictEqual(JSON.stringify(value));
          expect(cacheState.ttl).toStrictEqual(100);
        },
      );

      const sourceFn = jest.fn(() => {
        if (breaker) {
          throw Error();
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
