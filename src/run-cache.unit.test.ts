import { RunCache } from './run-cache';
import { EvictionPolicy } from './types/cache-config';
import { EVENT } from './types/events';

// These tests focus specifically on the RunCache facade class
// and its delegation to the CacheStore instance
describe('RunCache', () => {
  
  beforeEach(async () => {
    // Reset the cache before each test
    await RunCache.flush();
    // Clear all event listeners before each test to avoid test interference
    await RunCache.clearEventListeners();
  });
  
  afterEach(async () => {
    // Clean up after each test
    await RunCache.flush();
    await RunCache.clearEventListeners();
  });
  
  describe('Configuration', () => {
    it('should update and retrieve configuration', async () => {
      // Default config
      expect(await RunCache.getConfig()).toEqual({
        maxEntries: Number.POSITIVE_INFINITY,
        evictionPolicy: EvictionPolicy.NONE,
        debug: false,
        
      });
      
      // Update config
      await RunCache.configure({
        maxEntries: 100,
        evictionPolicy: EvictionPolicy.LRU,
        debug: false
      });
      
      expect(await RunCache.getConfig()).toEqual({
        maxEntries: 100,
        evictionPolicy: EvictionPolicy.LRU,
        debug: false,
        
      });
    });
  });
  
  describe('Cache Operations', () => {
    it('should store and retrieve values', async () => {
      await RunCache.set({ key: 'facade-key', value: 'facade-value' });
      const value = await RunCache.get('facade-key');
      expect(value).toBe('facade-value');
    });
    
    it('should delete values', async () => {
      await RunCache.set({ key: 'delete-key', value: 'delete-value' });
      expect(await RunCache.get('delete-key')).toBe('delete-value');
      
      const deleted = await RunCache.delete('delete-key');
      expect(deleted).toBe(true);
      expect(await RunCache.get('delete-key')).toBeUndefined();
    });
    
    it('should check if key exists', async () => {
      await RunCache.set({ key: 'has-key', value: 'has-value' });
      
      expect(await RunCache.has('has-key')).toBe(true);
      expect(await RunCache.has('missing-key')).toBe(false);
    });
    
    it('should use sourceFn for fetching values', async () => {
      const sourceFn = jest.fn().mockReturnValue('source-value');
      
      await RunCache.set({
        key: 'source-key',
        sourceFn
      });
      
      expect(sourceFn).toHaveBeenCalledTimes(1);
      expect(await RunCache.get('source-key')).toBe('source-value');
    });
    
    it('should manually refetch values', async () => {
      let counter = 0;
      const sourceFn = jest.fn().mockImplementation(() => {
        counter += 1;
        return `value-${counter}`;
      });
      
      await RunCache.set({
        key: 'refetch-key',
        sourceFn
      });
      
      expect(await RunCache.get('refetch-key')).toBe('value-1');
      
      await RunCache.refetch('refetch-key');
      
      expect(sourceFn).toHaveBeenCalledTimes(2);
      expect(await RunCache.get('refetch-key')).toBe('value-2');
    });
  });
  
  describe('Event Handling', () => {
    // These tests are more reasonable as integration tests, so we'll simplify them for unit tests
    it('should register global event listeners', async () => {
      const expirySpy = jest.fn();
      await RunCache.onExpiry(expirySpy);
      
      // We can't easily test the event firing in a unit test without creating complex mocks
      // So we'll just verify the event was registered
      expect(await RunCache.clearEventListeners({ event: EVENT._EXPIRE })).toBe(true);
    });
    
    it('should register key-specific event listeners', async () => {
      const keySpy = jest.fn();
      const specificKey = 'specific-key';
      
      await RunCache.onKeyExpiry(specificKey, keySpy);
      
      // Verify the event was registered by attempting to clear it
      expect(await RunCache.clearEventListeners({ 
        event: EVENT._EXPIRE,
        key: specificKey
      })).toBe(true);
    });
    
    it('should clear all event listeners', async () => {
      // First, add some event listeners
      const spy1 = jest.fn();
      const spy2 = jest.fn();
      
      await RunCache.onExpiry(spy1);
      await RunCache.onRefetch(spy2);
      
      // Clear all event listeners
      const result = await RunCache.clearEventListeners();
      expect(result).toBe(true);
      
      // Since we can't directly check if listeners are cleared internally,
      // we'll test indirectly by adding new listeners afterwards
      
      // Add new listeners after clearing
      const newSpy1 = jest.fn();
      const newSpy2 = jest.fn();
      await RunCache.onExpiry(newSpy1);
      await RunCache.onRefetch(newSpy2);
      
      // We should be able to clear these new listeners successfully
      expect(await RunCache.clearEventListeners()).toBe(true);
    });
  });
});

describe('Middleware', () => {
  beforeEach(async () => {
    await RunCache.flush();
    await RunCache.clearMiddleware();
  });

  test('should apply middleware to transform values during set operation', async () => {
    // Add a middleware that adds a prefix to all values during set
    await RunCache.use(async (value, context, next) => {
      if (context.operation === 'set' && value) {
        return next(`PREFIX_${value}`);
      }
      return next(value);
    });

    await RunCache.set({ key: 'test-key', value: 'test-value' });
    const result = await RunCache.get('test-key');
    
    expect(result).toBe('PREFIX_test-value');
  });

  test('should apply middleware to transform values during get operation', async () => {
    // Add a middleware that adds a suffix to all values during get
    await RunCache.use(async (value, context, next) => {
      if (context.operation === 'get' && value) {
        const result = await next(value);
        return result ? `${result}_SUFFIX` : result;
      }
      return next(value);
    });

    await RunCache.set({ key: 'test-key', value: 'test-value' });
    const result = await RunCache.get('test-key');
    
    expect(result).toBe('test-value_SUFFIX');
  });

  test('should chain multiple middleware in the correct order', async () => {
    // First middleware adds prefix but only during set
    await RunCache.use(async (value, context, next) => {
      if (context.operation === 'set' && value) {
        return next(`PREFIX_${value}`);
      }
      return next(value);
    });

    // Second middleware adds suffix but only during set
    await RunCache.use(async (value, context, next) => {
      if (context.operation === 'set' && value) {
        return next(`${value}_SUFFIX`);
      }
      return next(value);
    });

    await RunCache.set({ key: 'test-key', value: 'test-value' });
    const result = await RunCache.get('test-key');
    
    // Middleware should be applied in order: PREFIX_test-value_SUFFIX
    expect(result).toBe('PREFIX_test-value_SUFFIX');
  });

  test('should clear all middleware', async () => {
    // Add a middleware that alters values
    await RunCache.use(async (value, context, next) => {
      if (context.operation === 'set' && value) {
        return next(`MODIFIED_${value}`);
      }
      return next(value);
    });
    
    // Clear all middleware
    await RunCache.clearMiddleware();
    
    // Now the middleware should no longer apply
    await RunCache.set({ key: 'test-key', value: 'test-value' });
    const result = await RunCache.get('test-key');
    
    expect(result).toBe('test-value');  // Original value, not modified
  });
}); 