import { EventParam, RunCache } from "./run-cache";

import { EventEmitter } from 'events'

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RunCache", () => {
  beforeEach(() => {
    RunCache.deleteAll();
  });

  describe("set()", () => {
    it("should throw an error if the cache key or value is empty", async () => {
      await expect(() =>
        RunCache.set({ key: "", value: "value1" }),
      ).rejects.toThrow("Empty key");
      await expect(() =>
        RunCache.set({ key: "key1", value: "" }),
      ).rejects.toThrow("`value` can't be empty without a `sourceFn`");
    });

    it("should throw an error when a negative ttl is provided", async () => {
      await expect(
        RunCache.set({
          key: "key1",
          value: "value1",
          ttl: -1,
        }),
      ).rejects.toThrow("`ttl` cannot be negative");
    });

    it("should throw an error when the source function throws an error", async () => {
      const sourceFn = async () => {
        throw Error("Unexpected Error");
      };
      await expect(
        RunCache.set({
          key: "key1",
          sourceFn,
        }),
      ).rejects.toThrow("Source function failed for key: 'key1'");
    });

    it("should throw an error when the autoRefetch: true while ttl is not provided", async () => {
      const sourceFn = async () => "dynamicValue";
      await expect(
        RunCache.set({
          key: "key2",
          sourceFn,
          autoRefetch: true,
        }),
      ).rejects.toThrow("`autoRefetch` is not allowed without a `ttl`");
    });

    it("should be able to set a value with source function successfully", async () => {
      const sourceFn = async () => "dynamicValue";
      await RunCache.set({
        key: "key2",
        sourceFn,
      });
      expect(await RunCache.get("key2")).toBe(JSON.stringify("dynamicValue"));
    });

    it("should be able to set a value with source function, autoRefetch enabled successfully", async () => {
      const sourceFn = async () => "dynamicValue";
      await RunCache.set({
        key: "key2",
        sourceFn,
        ttl: 100,
        autoRefetch: true,
      });
      expect(await RunCache.get("key2")).toBe(JSON.stringify("dynamicValue"));
    });

    it("should return true if the cache value set successfully", async () => {
      expect(await RunCache.set({ key: "key1", value: "value1" })).toBe(true);
    });

    it("should return true if the cache set with a ttl and ttl is functioning properly", async () => {
      expect(
        await RunCache.set({ key: "key2", value: "value2", ttl: 100 }),
      ).toBe(true);
      expect(await RunCache.get("key2")).toBe("value2");

      // Wait for the TTL to expire
      await sleep(150);

      expect(await RunCache.get("key2")).toBeUndefined();
    });
  });

  describe("get()", () => {
    it("should return undefined if the key is empty", async () => {
      expect(await RunCache.get("")).toBeUndefined();
    });

    it("should return undefined if the key is not found", async () => {
      expect(await RunCache.get("key1")).toBeUndefined();
    });

    it("should return the value successfully if the cache is not expired", async () => {
      const sourceFn = async () => "value1";

      await RunCache.set({
        key: "key1",
        sourceFn,
        ttl: 100,
      });

      expect(await RunCache.get("key1")).toBe(JSON.stringify("value1"));
    });

    it("should auto refetch and return the new value successfully", async () => {
      let dynamicValue = "initialValue";

      const sourceFn = async () => dynamicValue;

      await RunCache.set({
        key: "key2",
        sourceFn,
        autoRefetch: true,
        ttl: 100,
      });

      expect(await RunCache.get("key2")).toBe(JSON.stringify("initialValue"));

      dynamicValue = "updatedValue";

      // Wait for the TTL to expire
      await sleep(150);

      expect(await RunCache.get("key2")).toBe(JSON.stringify("updatedValue"));
    });

    it("should return the value successfully", async () => {
      RunCache.set({ key: "key3", value: "value1" });
      expect(await RunCache.get("key3")).toBe("value1");
    });
  });

  describe("delete()", () => {
    it("should return false if the operation failed", () => {
      expect(RunCache.delete("nonExistentKey")).toBe(false);
    });

    it("should return true if the value is successfully deleted", async () => {
      RunCache.set({ key: "key1", value: "value1" });
      expect(RunCache.delete("key1")).toBe(true);
      expect(await RunCache.get("key1")).toBeUndefined();
    });
  });

  describe("deleteAll()", () => {
    it("should clear all values", async () => {
      RunCache.set({ key: "key1", value: "value1" });
      RunCache.set({ key: "key2", value: "value2" });
      RunCache.deleteAll();
      expect(await RunCache.get("key1")).toBeUndefined();
      expect(await RunCache.get("key2")).toBeUndefined();
    });
  });

  describe("has()", () => {
    it("should return true if the key exists", () => {
      RunCache.set({ key: "key1", value: "value1" });
      expect(RunCache.has("key1")).toBe(true);
    });

    it("should return false if the key exists", () => {
      expect(RunCache.has("nonExistentKey")).toBe(false);
    });

    it("should return false after ttl expiry", async () => {
      RunCache.set({ key: "key2", value: "value2", ttl: 50 }); // Set TTL to 50ms
      expect(RunCache.has("key2")).toBe(true);

      // Wait for the TTL to expire
      await sleep(150);

      expect(RunCache.has("key2")).toBe(false);
    });
  });

  describe("refetch()", () => {
    it("should throw an error if refetch is called on a key having no source function", async () => {
      RunCache.set({ key: "key2", value: "value2" });
      await expect(RunCache.refetch("key2")).rejects.toThrow(
        `No source function found for key: 'key2'`,
      );
    });

    it("should throw an error when the source function throws an error", async () => {
      let breaker = false;

      const sourceFn = async () => {
        if (breaker) {
          throw Error("Unexpected Error");
        } else {
          return "SomeValue";
        }
      };
      await RunCache.set({ key: "key3", sourceFn });

      // Make source function to fail
      breaker = true;

      expect(RunCache.refetch("key3")).rejects.toThrow(
        "Source function failed for key: 'key3'",
      );
    });

    it("should not refetch if the key does not exist", async () => {
      await expect(RunCache.refetch("nonExistentKey")).resolves.toBeFalsy();
    });

    it("should refetch and update the value from the source function", async () => {
      let dynamicValue = "initialValue";
      const sourceFn = async () => dynamicValue;

      await RunCache.set({ key: "key1", sourceFn });
      expect(await RunCache.get("key1")).toBe(JSON.stringify("initialValue"));

      // Update what's being returned in the source function
      dynamicValue = "updatedValue";

      await RunCache.refetch("key1");
      expect(await RunCache.get("key1")).toBe(JSON.stringify("updatedValue"));
    });

    it('should trigger onRefetch event on refetch', async () => {
      let dynamicValue = "initialValue";
      const sourceFn = async () => dynamicValue;

      const funcToBeExecutedOnRefetch = async (cacheState: EventParam) => {
        expect(cacheState.key).toBe('key2')
        expect(cacheState.value).toBe(JSON.stringify('updatedValue'))
      }

      await RunCache.set({ key: "key2", sourceFn, onRefetch: funcToBeExecutedOnRefetch });
      expect(await RunCache.get("key2")).toBe(JSON.stringify("initialValue"));

      // Update what's being returned in the source function
      dynamicValue = "updatedValue";

      await RunCache.refetch("key2");
    })
  });
});
