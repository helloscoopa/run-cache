import { RunCache } from "./run-cache";

describe("RunCache", () => {
  beforeEach(() => {
    RunCache.deleteAll();
  });

  describe("set()", () => {
    it("should throw an error if the cache key or value is empty", () => {
      expect(() => RunCache.set("", "value1")).toThrow("Empty key");
      expect(() => RunCache.set("key1", "")).toThrow("Empty value");
    });

    it("should return true if the cache value set successfully", () => {
      expect(RunCache.set("key1", "value1")).toBe(true);
    });

    it("should return true if the cache set with a ttl and ttl is functioning properly", () => {
      expect(RunCache.set("key2", "value2", 100)).toBe(true);
      expect(RunCache.get("key2")).toBe("value2");

      // Wait for the TTL to expire
      setTimeout(() => {
        expect(RunCache.get("key2")).toBeUndefined();
      }, 150);
    });
  });

  describe("get()", () => {
    it("should return undefined if the key is empty", () => {
      expect(RunCache.get("")).toBeUndefined();
    });

    it("should return undefined if the key is not found", () => {
      expect(RunCache.get("key1")).toBeUndefined();
    });

    it("should return the value successfully", () => {
      RunCache.set("key1", "value1");
      expect(RunCache.get("key1")).toBe("value1");
    });
  });

  describe("delete()", () => {
    it("should return false if the operation failed", () => {
      expect(RunCache.delete("nonExistentKey")).toBe(false);
    });

    it("should return true if the value is successfully deleted", () => {
      RunCache.set("key1", "value1");
      expect(RunCache.delete("key1")).toBe(true);
      expect(RunCache.get("key1")).toBeUndefined();
    });
  });

  describe("deleteAll()", () => {
    it("should clear all values", () => {
      RunCache.set("key1", "value1");
      RunCache.set("key2", "value2");
      RunCache.deleteAll();
      expect(RunCache.get("key1")).toBeUndefined();
      expect(RunCache.get("key2")).toBeUndefined();
    });
  });

  describe("has()", () => {
    it("should return true if the key exists", () => {
      RunCache.set("key1", "value1");
      expect(RunCache.has("key1")).toBe(true);
    });

    it("should return false if the key exists", () => {
      expect(RunCache.has("nonExistentKey")).toBe(false);
    });

    it("should return false after ttl expiry", () => {
      RunCache.set("key2", "value2", 50); // Set TTL to 50ms
      expect(RunCache.has("key2")).toBe(true);

      // Wait for the TTL to expire
      setTimeout(() => {
        expect(RunCache.has("key2")).toBe(false);
      }, 100);
    });
  });

  describe("setWithSourceFn()", () => {
    it("should throw an error when the source function throws an error", async () => {
      let sourceFn = async () => {
        throw Error("Unexpected Error");
      };
      expect(RunCache.setWithSourceFn("key1", sourceFn)).rejects.toThrow(
        "Source function failed",
      );
    });

    it("should be able to set a value with source function successfully", async () => {
      const sourceFn = async () => "dynamicValue";
      await RunCache.setWithSourceFn("key2", sourceFn);
      expect(RunCache.get("key2")).toBe('"dynamicValue"');
    });
  });

  describe("refetch()", () => {
    it("should throw an error if refetch is called on a key having no source function", async () => {
      RunCache.set("key2", "value2");
      await expect(RunCache.refetch("key2")).rejects.toThrow(
        "No source function found",
      );
    });

    it("should throw an error when the source function throws an error", async () => {
      let breaker = false;

      let sourceFn = async () => {
        if (breaker) {
          throw Error("Unexpected Error");
        } else {
          return "SomeValue";
        }
      };
      await RunCache.setWithSourceFn("key3", sourceFn);

      // Make source function to fail
      breaker = true;

      expect(RunCache.refetch("key3")).rejects.toThrow(
        "Source function failed",
      );
    });

    it("should not refetch if the key does not exist", async () => {
      await expect(RunCache.refetch("nonExistentKey")).resolves.toBeFalsy();
    });

    it("should refetch and update the value from the source function", async () => {
      let dynamicValue = "initialValue";
      const sourceFn = async () => dynamicValue;

      await RunCache.setWithSourceFn("key1", sourceFn);
      expect(RunCache.get("key1")).toBe('"initialValue"');

      // Update what's being returned in the source function
      dynamicValue = "updatedValue";

      await RunCache.refetch("key1");
      expect(RunCache.get("key1")).toBe('"updatedValue"');
    });
  });
});
