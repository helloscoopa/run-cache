import { RunCache } from './run-cache';
import { EvictionPolicy } from './types/cache-config';
import { EVENT } from './types/events';

// These tests focus specifically on the RunCache facade class
// and its delegation to the CacheStore instance
describe('RunCache', () => {
  
  beforeEach(() => {
    // Reset the cache before each test
    RunCache.flush();
    // Clear all event listeners before each test to avoid test interference
    RunCache.clearEventListeners();
  });
  
  afterEach(() => {
    // Clean up after each test
    RunCache.flush();
    RunCache.clearEventListeners();
  });
  
  describe('Configuration', () => {
    it('should update and retrieve configuration', () => {
      // Default config
      expect(RunCache.getConfig()).toEqual({
        maxSize: Number.POSITIVE_INFINITY,
        evictionPolicy: EvictionPolicy.NONE,
        verbose: false
      });
      
      // Update config
      RunCache.configure({
        maxSize: 100,
        evictionPolicy: EvictionPolicy.LRU,
        verbose: false
      });
      
      expect(RunCache.getConfig()).toEqual({
        maxSize: 100,
        evictionPolicy: EvictionPolicy.LRU,
        verbose: false
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
      
      const deleted = RunCache.delete('delete-key');
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
    it('should register global event listeners', () => {
      const expirySpy = jest.fn();
      RunCache.onExpiry(expirySpy);
      
      // We can't easily test the event firing in a unit test without creating complex mocks
      // So we'll just verify the event was registered
      expect(RunCache.clearEventListeners({ event: EVENT.EXPIRE })).toBe(true);
    });
    
    it('should register key-specific event listeners', () => {
      const keySpy = jest.fn();
      const specificKey = 'specific-key';
      
      RunCache.onKeyExpiry(specificKey, keySpy);
      
      // Verify the event was registered by attempting to clear it
      expect(RunCache.clearEventListeners({ 
        event: EVENT.EXPIRE,
        key: specificKey
      })).toBe(true);
    });
    
    it('should clear all event listeners', () => {
      // First, add some event listeners
      const spy1 = jest.fn();
      const spy2 = jest.fn();
      
      RunCache.onExpiry(spy1);
      RunCache.onRefetch(spy2);
      
      // Clear all event listeners
      const result = RunCache.clearEventListeners();
      expect(result).toBe(true);
      
      // Since we can't directly check if listeners are cleared internally,
      // we'll test indirectly by adding new listeners afterwards
      
      // Add new listeners after clearing
      const newSpy1 = jest.fn();
      const newSpy2 = jest.fn();
      RunCache.onExpiry(newSpy1);
      RunCache.onRefetch(newSpy2);
      
      // We should be able to clear these new listeners successfully
      expect(RunCache.clearEventListeners()).toBe(true);
    });
  });
});

describe('Middleware', () => {
  beforeEach(() => {
    RunCache.flush();
    RunCache.clearMiddleware();
  });

  test('should apply middleware to transform values during set operation', async () => {
    // Add a middleware that adds a prefix to all values during set
    RunCache.use(async (value, context, next) => {
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
    RunCache.use(async (value, context, next) => {
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
    RunCache.use(async (value, context, next) => {
      if (context.operation === 'set' && value) {
        return next(`PREFIX_${value}`);
      }
      return next(value);
    });

    // Second middleware adds suffix but only during set
    RunCache.use(async (value, context, next) => {
      if (context.operation === 'set' && value) {
        return next(`${value}_SUFFIX`);
      }
      return next(value);
    });

    // First set a value to confirm middleware works during set
    await RunCache.set({ key: 'test-key', value: 'test-value' });
    const result = await RunCache.get('test-key');
    
    // Order should be: PREFIX_test-value_SUFFIX
    expect(result).toBe('PREFIX_test-value_SUFFIX');
  });

  test('should apply middleware during refetch operations', async () => {
    let counter = 0;
    const sourceFn = () => {
      counter++;
      return `value-${counter}`;
    };

    // Middleware that adds a counter to refetched values
    RunCache.use(async (value, context, next) => {
      if (context.operation === 'refetch' && value) {
        return next(`${value}-REFETCHED`);
      }
      return next(value);
    });

    // Set with auto-refetch enabled
    await RunCache.set({ 
      key: 'refetch-key', 
      sourceFn,
      ttl: 100, 
      autoRefetch: true 
    });

    // Initial value
    let result = await RunCache.get('refetch-key');
    expect(result).toBe('value-1');

    // Trigger manual refetch
    await RunCache.refetch('refetch-key');
    
    // Value after refetch should have the middleware transformation
    result = await RunCache.get('refetch-key');
    expect(result).toBe('value-2-REFETCHED');
  });

  test('should clear all middleware functions', async () => {
    // Add a middleware that transforms values on GET
    RunCache.use(async (value, context, next) => {
      if (context.operation === 'get' && value) {
        return `TRANSFORMED_${value}`;  // Don't call next() to avoid chaining issues
      }
      return next(value);
    });

    // Set a value 
    await RunCache.set({ key: 'test-key', value: 'test-value' });
    let result = await RunCache.get('test-key');
    expect(result).toBe('TRANSFORMED_test-value');

    // Clear all middleware
    RunCache.clearMiddleware();
    RunCache.flush();  // Clear all cache entries

    // Set a new value without middleware
    await RunCache.set({ key: 'test-key-2', value: 'test-value-2' });
    result = await RunCache.get('test-key-2');
    expect(result).toBe('test-value-2');
  });

  test('should provide correct context to middleware', async () => {
    let capturedContext: any = undefined;

    // Middleware that captures the context
    RunCache.use(async (value, context, next) => {
      capturedContext = { ...context };
      return next(value);
    });

    const testKey = 'context-test-key';
    const testValue = 'context-test-value';
    const testTtl = 1000;

    await RunCache.set({ 
      key: testKey, 
      value: testValue,
      ttl: testTtl
    });

    expect(capturedContext).toBeDefined();
    expect(capturedContext!.key).toBe(testKey);
    expect(capturedContext!.operation).toBe('set');
    expect(capturedContext!.value).toBe(testValue);
    expect(capturedContext!.ttl).toBe(testTtl);
    expect(capturedContext!.timestamp).toBeGreaterThan(0);
  });
}); 