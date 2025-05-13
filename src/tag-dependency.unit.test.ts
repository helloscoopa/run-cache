import { RunCache } from "./run-cache";
import { v4 as uuid } from "uuid";

describe("Tag and Dependency Invalidation", () => {
  beforeEach(async () => {
    await RunCache.flush();
    await RunCache.clearEventListeners();
  });

  describe("Tag-based Invalidation", () => {
    it("should add tags to cache entries", async () => {
      const key = uuid();
      const tag = "user:123";
      const value = "test value";

      await RunCache.set({ key, value, tags: [tag] });
      
      // Verify the cache entry was set
      expect(await RunCache.get(key)).toBe(value);
    });

    it("should invalidate entries by tag", async () => {
      const tag = "user:123";
      const keys = [uuid(), uuid(), uuid()];
      const otherKey = uuid();

      // Set cache entries with tags
      for (const key of keys) {
        await RunCache.set({ key, value: `value-${key}`, tags: [tag] });
      }
      
      // Set an entry without the tag
      await RunCache.set({ key: otherKey, value: "other-value" });

      // Verify all entries exist
      for (const key of keys) {
        expect(await RunCache.get(key)).toBe(`value-${key}`);
      }
      expect(await RunCache.get(otherKey)).toBe("other-value");

      // Invalidate by tag
      const invalidated = await RunCache.invalidateByTag(tag);
      expect(invalidated).toBe(true);

      // Verify tagged entries are removed
      for (const key of keys) {
        expect(await RunCache.get(key)).toBeUndefined();
      }
      
      // Verify untagged entry still exists
      expect(await RunCache.get(otherKey)).toBe("other-value");
    });

    it("should allow multiple tags per entry", async () => {
      const key = uuid();
      const tags = ["user:123", "profile", "settings"];
      
      await RunCache.set({ key, value: "multi-tagged-value", tags });
      
      // Invalidate by one of the tags
      await RunCache.invalidateByTag("profile");
      
      // Verify the entry was invalidated
      expect(await RunCache.get(key)).toBeUndefined();
    });

    it("should trigger tag invalidation events", async () => {
      const tag = "user:123";
      const key = uuid();
      const value = "tagged-value";
      
      const tagInvalidationCallback = jest.fn();
      const keyInvalidationCallback = jest.fn();
      
      // Register event listeners
      await RunCache.onTagInvalidation(tagInvalidationCallback);
      await RunCache.onKeyTagInvalidation(key, keyInvalidationCallback);
      
      // Set cache entry with tag
      await RunCache.set({ key, value, tags: [tag] });
      
      // Invalidate by tag
      await RunCache.invalidateByTag(tag);
      
      // Verify callbacks were called
      expect(tagInvalidationCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          key,
          value,
          tag: 'user:123'
        })
      );
      
      expect(keyInvalidationCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          key,
          value,
          tag
        })
      );
    });

    it("should return false when invalidating with a non-existent tag", async () => {
      const result = await RunCache.invalidateByTag("non-existent-tag");
      expect(result).toBe(false);
    });
  });

  describe("Dependency-based Invalidation", () => {
    it("should add dependencies to cache entries", async () => {
      const dependencyKey = uuid();
      const dependentKey = uuid();
      
      // Set the dependency entry
      await RunCache.set({ key: dependencyKey, value: "dependency-value" });
      
      // Set the dependent entry
      await RunCache.set({ 
        key: dependentKey, 
        value: "dependent-value", 
        dependencies: [dependencyKey] 
      });
      
      // Verify both entries exist
      expect(await RunCache.get(dependencyKey)).toBe("dependency-value");
      expect(await RunCache.get(dependentKey)).toBe("dependent-value");
    });

    it("should invalidate entries by dependency", async () => {
      const dependencyKey = uuid();
      const dependentKeys = [uuid(), uuid(), uuid()];
      const otherKey = uuid();
      
      // Set the dependency entry
      await RunCache.set({ key: dependencyKey, value: "dependency-value" });
      
      // Set dependent entries
      for (const key of dependentKeys) {
        await RunCache.set({ 
          key, 
          value: `dependent-${key}`,
          dependencies: [dependencyKey]
        });
      }
      
      // Set an entry without dependency
      await RunCache.set({ key: otherKey, value: "other-value" });
      
      // Invalidate by dependency
      const invalidated = await RunCache.invalidateByDependency(dependencyKey);
      expect(invalidated).toBe(true);
      
      // Verify dependent entries were invalidated
      for (const key of dependentKeys) {
        expect(await RunCache.get(key)).toBeUndefined();
      }
      
      // Verify dependency and other entry still exist
      expect(await RunCache.get(dependencyKey)).toBe("dependency-value");
      expect(await RunCache.get(otherKey)).toBe("other-value");
    });

    it("should support multi-level dependency cascading", async () => {
      const rootKey = uuid();
      const level1Key = uuid();
      const level2Key = uuid();
      
      // Root entry
      await RunCache.set({ key: rootKey, value: "root-value" });
      
      // Level 1 depends on root
      await RunCache.set({ 
        key: level1Key, 
        value: "level1-value",
        dependencies: [rootKey]
      });
      
      // Level 2 depends on level 1
      await RunCache.set({ 
        key: level2Key, 
        value: "level2-value",
        dependencies: [level1Key]
      });
      
      // Verify all entries exist
      expect(await RunCache.get(rootKey)).toBe("root-value");
      expect(await RunCache.get(level1Key)).toBe("level1-value");
      expect(await RunCache.get(level2Key)).toBe("level2-value");
      
      // Check dependency relationships
      expect(await RunCache.isDependencyOf(level1Key, rootKey)).toBe(true);
      expect(await RunCache.isDependencyOf(level2Key, level1Key)).toBe(true);
      expect(await RunCache.isDependencyOf(level2Key, rootKey)).toBe(true);
      
      // Invalidate by root dependency - should cascade to all levels
      await RunCache.invalidateByDependency(rootKey);
      
      // Verify level 1 and 2 were invalidated via cascading effect
      expect(await RunCache.get(rootKey)).toBe("root-value"); // Root should still exist
      expect(await RunCache.get(level1Key)).toBeUndefined();
      expect(await RunCache.get(level2Key)).toBeUndefined();
    });

    it("should trigger dependency invalidation events", async () => {
      const dependencyKey = uuid();
      const dependentKey = uuid();
      
      const depInvalidationCallback = jest.fn();
      const keyInvalidationCallback = jest.fn();
      
      // Register event listeners
      await RunCache.onDependencyInvalidation(depInvalidationCallback);
      await RunCache.onKeyDependencyInvalidation(dependentKey, keyInvalidationCallback);
      
      // Set cache entries
      await RunCache.set({ key: dependencyKey, value: "dependency-value" });
      await RunCache.set({ 
        key: dependentKey, 
        value: "dependent-value", 
        dependencies: [dependencyKey]
      });
      
      // Invalidate by dependency
      await RunCache.invalidateByDependency(dependencyKey);
      
      // Verify callbacks were called
      expect(depInvalidationCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          key: dependentKey,
          value: 'dependent-value',
          dependencyKey
        })
      );
      
      expect(keyInvalidationCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          key: dependentKey,
          value: "dependent-value",
          dependencyKey
        })
      );
    });

    it("should return false when invalidating with a non-existent dependency", async () => {
      const result = await RunCache.invalidateByDependency("non-existent-dependency");
      expect(result).toBe(false);
    });
  });

  describe("Combined Tag and Dependency Features", () => {
    it("should support both tags and dependencies on the same entry", async () => {
      const tag = "user:123";
      const dependencyKey = uuid();
      const entryKey = uuid();
      
      // Set dependency entry
      await RunCache.set({ key: dependencyKey, value: "dependency-value" });
      
      // Set entry with both tag and dependency
      await RunCache.set({ 
        key: entryKey, 
        value: "combined-value",
        tags: [tag],
        dependencies: [dependencyKey]
      });
      
      // Verify entry exists
      expect(await RunCache.get(entryKey)).toBe("combined-value");
      
      // Invalidate by tag
      await RunCache.invalidateByTag(tag);
      
      // Verify entry was invalidated
      expect(await RunCache.get(entryKey)).toBeUndefined();
      
      // Recreate the entry
      await RunCache.set({ 
        key: entryKey, 
        value: "combined-value",
        tags: [tag],
        dependencies: [dependencyKey]
      });
      
      // Verify entry exists again
      expect(await RunCache.get(entryKey)).toBe("combined-value");
      
      // Now invalidate by dependency
      await RunCache.invalidateByDependency(dependencyKey);
      
      // Verify entry was invalidated
      expect(await RunCache.get(entryKey)).toBeUndefined();
    });
  });
}); 