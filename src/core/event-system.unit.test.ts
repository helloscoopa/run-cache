import { EventSystem } from './event-system';
import { Logger } from '../logging/logger';
import { EventParam, EventName } from '../types/events';

describe('EventSystem', () => {
  let eventSystem: EventSystem;
  let logger: Logger;
  let mockLoggerLog: jest.SpyInstance;

  beforeEach(() => {
    logger = new Logger({ debug: false });
    mockLoggerLog = jest.spyOn(logger, 'log').mockImplementation();
    eventSystem = new EventSystem(logger);
  });

  afterEach(() => {
    mockLoggerLog.mockRestore();
    eventSystem.clearEventListeners();
  });

  // Helper to create an event parameter
  function createEventParam(key: string = 'test-key'): EventParam {
    return {
      key,
      value: 'test-value',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ttl: 1000,
    };
  }

  // Helper to create a tag invalidation event parameter
  function createTagEventParam(key: string = 'test-key', tag: string = 'test-tag'): EventParam {
    return {
      key,
      value: 'test-value',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ttl: 1000,
      tag,
    };
  }

  // Helper to create a dependency invalidation event parameter
  function createDependencyEventParam(key: string = 'test-key', dependencyKey: string = 'dependency-key'): EventParam {
    return {
      key,
      value: 'test-value',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ttl: 1000,
      dependencyKey,
    };
  }

  describe('Global Events', () => {
    it('should register and trigger global event listeners', () => {
      const expirySpy = jest.fn();
      eventSystem.onExpiry(expirySpy);

      const eventParam = createEventParam();
      eventSystem.emitEvent('EXPIRE' as EventName, eventParam);

      expect(expirySpy).toHaveBeenCalledTimes(1);
      expect(expirySpy).toHaveBeenCalledWith(eventParam);
    });

    it('should register and trigger global refetch listeners', () => {
      const refetchSpy = jest.fn();
      eventSystem.onRefetch(refetchSpy);

      const eventParam = createEventParam();
      eventSystem.emitEvent('REFETCH' as EventName, eventParam);

      expect(refetchSpy).toHaveBeenCalledTimes(1);
      expect(refetchSpy).toHaveBeenCalledWith(eventParam);
    });

    it('should register and trigger global refetch failure listeners', () => {
      const refetchFailureSpy = jest.fn();
      eventSystem.onRefetchFailure(refetchFailureSpy);

      const eventParam = createEventParam();
      eventSystem.emitEvent('REFETCH_FAILURE' as EventName, eventParam);

      expect(refetchFailureSpy).toHaveBeenCalledTimes(1);
      expect(refetchFailureSpy).toHaveBeenCalledWith(eventParam);
    });

    it('should register and trigger global tag invalidation listeners', () => {
      const tagInvalidationSpy = jest.fn();
      eventSystem.onTagInvalidation(tagInvalidationSpy);

      const eventParam = createTagEventParam();
      eventSystem.emitEvent('TAG_INVALIDATION' as EventName, eventParam);

      expect(tagInvalidationSpy).toHaveBeenCalledTimes(1);
      expect(tagInvalidationSpy).toHaveBeenCalledWith(eventParam);
    });

    it('should register and trigger global dependency invalidation listeners', () => {
      const dependencyInvalidationSpy = jest.fn();
      eventSystem.onDependencyInvalidation(dependencyInvalidationSpy);

      const eventParam = createDependencyEventParam();
      eventSystem.emitEvent('DEPENDENCY_INVALIDATION' as EventName, eventParam);

      expect(dependencyInvalidationSpy).toHaveBeenCalledTimes(1);
      expect(dependencyInvalidationSpy).toHaveBeenCalledWith(eventParam);
    });
  });

  describe('Key-specific Events', () => {
    it('should register and trigger key-specific event listeners', () => {
      const keySpy = jest.fn();
      const key = 'specific-key';
      eventSystem.onKeyExpiry(key, keySpy);

      const eventParam = createEventParam(key);
      eventSystem.emitEvent('EXPIRE' as EventName, eventParam);

      expect(keySpy).toHaveBeenCalledTimes(1);
      expect(keySpy).toHaveBeenCalledWith(eventParam);
    });

    it('should not trigger key-specific listener for different keys', () => {
      const keySpy = jest.fn();
      eventSystem.onKeyExpiry('key1', keySpy);

      const eventParam = createEventParam('key2');
      eventSystem.emitEvent('EXPIRE' as EventName, eventParam);

      expect(keySpy).not.toHaveBeenCalled();
    });

    it('should throw an error when registering a listener with an empty key', () => {
      expect(() => eventSystem.onKeyExpiry('', jest.fn())).toThrow('Empty key');
    });

    it('should register and trigger key-specific tag invalidation listeners', () => {
      const keySpy = jest.fn();
      const key = 'specific-key';
      eventSystem.onKeyTagInvalidation(key, keySpy);

      const eventParam = createTagEventParam(key);
      eventSystem.emitEvent('TAG_INVALIDATION' as EventName, eventParam);

      expect(keySpy).toHaveBeenCalledTimes(1);
      expect(keySpy).toHaveBeenCalledWith(eventParam);
    });

    it('should register and trigger key-specific dependency invalidation listeners', () => {
      const keySpy = jest.fn();
      const key = 'specific-key';
      eventSystem.onKeyDependencyInvalidation(key, keySpy);

      const eventParam = createDependencyEventParam(key);
      eventSystem.emitEvent('DEPENDENCY_INVALIDATION' as EventName, eventParam);

      expect(keySpy).toHaveBeenCalledTimes(1);
      expect(keySpy).toHaveBeenCalledWith(eventParam);
    });
  });

  describe('Wildcard Events', () => {
    it('should register and trigger wildcard event listeners', () => {
      const wildcardSpy = jest.fn();
      eventSystem.onKeyExpiry('user:*:profile', wildcardSpy);

      const matchingEventParam = createEventParam('user:123:profile');
      eventSystem.emitEvent('EXPIRE' as EventName, matchingEventParam);

      expect(wildcardSpy).toHaveBeenCalledTimes(1);
      expect(wildcardSpy).toHaveBeenCalledWith(matchingEventParam);

      // Non-matching key should not trigger
      const nonMatchingEventParam = createEventParam('admin:123:profile');
      eventSystem.emitEvent('EXPIRE' as EventName, nonMatchingEventParam);

      expect(wildcardSpy).toHaveBeenCalledTimes(1); // Still just 1 call
    });

    it('should support multiple wildcards in patterns', () => {
      const multiWildcardSpy = jest.fn();
      eventSystem.onKeyExpiry('*:*:profile', multiWildcardSpy);

      // These should all match
      const userProfileParam = createEventParam('user:123:profile');
      const adminProfileParam = createEventParam('admin:456:profile');

      eventSystem.emitEvent('EXPIRE' as EventName, userProfileParam);
      eventSystem.emitEvent('EXPIRE' as EventName, adminProfileParam);

      expect(multiWildcardSpy).toHaveBeenCalledTimes(2);

      // This should not match
      const settingsParam = createEventParam('user:123:settings');
      eventSystem.emitEvent('EXPIRE' as EventName, settingsParam);

      expect(multiWildcardSpy).toHaveBeenCalledTimes(2); // Still just 2 calls
    });

    it('should support wildcards for tag invalidation events', () => {
      const wildcardSpy = jest.fn();
      eventSystem.onKeyTagInvalidation('user:*:profile', wildcardSpy);

      // This should match
      const matchingEventParam = createTagEventParam('user:123:profile', 'profile-tag');
      eventSystem.emitEvent('TAG_INVALIDATION' as EventName, matchingEventParam);

      expect(wildcardSpy).toHaveBeenCalledTimes(1);
      expect(wildcardSpy).toHaveBeenCalledWith(matchingEventParam);

      // This should not match
      const nonMatchingEventParam = createTagEventParam('admin:123:profile', 'profile-tag');
      eventSystem.emitEvent('TAG_INVALIDATION' as EventName, nonMatchingEventParam);

      expect(wildcardSpy).toHaveBeenCalledTimes(1); // Still just 1 call
    });

    it('should support wildcards for dependency invalidation events', () => {
      const wildcardSpy = jest.fn();
      eventSystem.onKeyDependencyInvalidation('dashboard:*', wildcardSpy);

      // This should match
      const matchingEventParam = createDependencyEventParam('dashboard:user123', 'user:profile');
      eventSystem.emitEvent('DEPENDENCY_INVALIDATION' as EventName, matchingEventParam);

      expect(wildcardSpy).toHaveBeenCalledTimes(1);
      expect(wildcardSpy).toHaveBeenCalledWith(matchingEventParam);

      // This should not match
      const nonMatchingEventParam = createDependencyEventParam('feed:user123', 'user:profile');
      eventSystem.emitEvent('DEPENDENCY_INVALIDATION' as EventName, nonMatchingEventParam);

      expect(wildcardSpy).toHaveBeenCalledTimes(1); // Still just 1 call
    });
  });

  describe('clearEventListeners', () => {
    it('should clear all event listeners when called without parameters', () => {
      const spy1 = jest.fn();
      const spy2 = jest.fn();
      const spy3 = jest.fn();
      const spy4 = jest.fn();

      eventSystem.onExpiry(spy1);
      eventSystem.onRefetch(spy2);
      eventSystem.onTagInvalidation(spy3);
      eventSystem.onDependencyInvalidation(spy4);

      const result = eventSystem.clearEventListeners();

      expect(result).toBe(true);

      eventSystem.emitEvent('EXPIRE' as EventName, createEventParam());
      eventSystem.emitEvent('REFETCH' as EventName, createEventParam());
      eventSystem.emitEvent('TAG_INVALIDATION' as EventName, createTagEventParam());
      eventSystem.emitEvent('DEPENDENCY_INVALIDATION' as EventName, createDependencyEventParam());

      expect(spy1).not.toHaveBeenCalled();
      expect(spy2).not.toHaveBeenCalled();
      expect(spy3).not.toHaveBeenCalled();
      expect(spy4).not.toHaveBeenCalled();
    });

    it('should clear only specified event type listeners', () => {
      const expirySpy = jest.fn();
      const tagInvalidationSpy = jest.fn();

      eventSystem.onExpiry(expirySpy);
      eventSystem.onTagInvalidation(tagInvalidationSpy);

      const result = eventSystem.clearEventListeners({ event: 'EXPIRE' as EventName });

      expect(result).toBe(true);

      eventSystem.emitEvent('EXPIRE' as EventName, createEventParam());
      eventSystem.emitEvent('TAG_INVALIDATION' as EventName, createTagEventParam());

      expect(expirySpy).not.toHaveBeenCalled();
      expect(tagInvalidationSpy).toHaveBeenCalledTimes(1);
    });

    it('should clear only specified key event listeners', () => {
      const key1Spy = jest.fn();
      const key2Spy = jest.fn();

      eventSystem.onKeyTagInvalidation('key1', key1Spy);
      eventSystem.onKeyTagInvalidation('key2', key2Spy);

      const result = eventSystem.clearEventListeners({
        event: 'TAG_INVALIDATION' as EventName,
        key: 'key1',
      });

      expect(result).toBe(true);

      eventSystem.emitEvent('TAG_INVALIDATION' as EventName, createTagEventParam('key1'));
      eventSystem.emitEvent('TAG_INVALIDATION' as EventName, createTagEventParam('key2'));

      expect(key1Spy).not.toHaveBeenCalled();
      expect(key2Spy).toHaveBeenCalledTimes(1);
    });

    it('should throw an error when key is provided without event', () => {
      expect(() => eventSystem.clearEventListeners({ key: 'key1' })).toThrow(
        '`key` cannot be provided without `event`',
      );
    });

    it('should clear wildcard pattern listeners', () => {
      const wildcardSpy = jest.fn();
      eventSystem.onKeyDependencyInvalidation('user:*:profile', wildcardSpy);

      const result = eventSystem.clearEventListeners({
        event: 'DEPENDENCY_INVALIDATION' as EventName,
        key: 'user:*:*',
      });

      expect(result).toBe(true);

      eventSystem.emitEvent('DEPENDENCY_INVALIDATION' as EventName, createDependencyEventParam('user:123:profile'));

      expect(wildcardSpy).not.toHaveBeenCalled();
    });
  });
});
