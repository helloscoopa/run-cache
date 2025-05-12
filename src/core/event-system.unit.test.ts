import { EventSystem } from './event-system';
import { EVENT, EventParam } from '../types/events';
import { Logger } from '../logging/logger';

describe('EventSystem', () => {
  let eventSystem: EventSystem;
  let logger: Logger;
  let mockLoggerLog: jest.SpyInstance;
  
  beforeEach(() => {
    logger = new Logger({ verbose: false });
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
      ttl: 1000
    };
  }
  
  describe('Global Events', () => {
    it('should register and trigger global event listeners', () => {
      const expirySpy = jest.fn();
      eventSystem.onExpiry(expirySpy);
      
      const eventParam = createEventParam();
      eventSystem.emitEvent(EVENT.EXPIRE, eventParam);
      
      expect(expirySpy).toHaveBeenCalledTimes(1);
      expect(expirySpy).toHaveBeenCalledWith(eventParam);
    });
    
    it('should register and trigger global refetch listeners', () => {
      const refetchSpy = jest.fn();
      eventSystem.onRefetch(refetchSpy);
      
      const eventParam = createEventParam();
      eventSystem.emitEvent(EVENT.REFETCH, eventParam);
      
      expect(refetchSpy).toHaveBeenCalledTimes(1);
      expect(refetchSpy).toHaveBeenCalledWith(eventParam);
    });
    
    it('should register and trigger global refetch failure listeners', () => {
      const refetchFailureSpy = jest.fn();
      eventSystem.onRefetchFailure(refetchFailureSpy);
      
      const eventParam = createEventParam();
      eventSystem.emitEvent(EVENT.REFETCH_FAILURE, eventParam);
      
      expect(refetchFailureSpy).toHaveBeenCalledTimes(1);
      expect(refetchFailureSpy).toHaveBeenCalledWith(eventParam);
    });
  });
  
  describe('Key-specific Events', () => {
    it('should register and trigger key-specific event listeners', () => {
      const keySpy = jest.fn();
      const key = 'specific-key';
      eventSystem.onKeyExpiry(key, keySpy);
      
      const eventParam = createEventParam(key);
      eventSystem.emitEvent(EVENT.EXPIRE, eventParam);
      
      expect(keySpy).toHaveBeenCalledTimes(1);
      expect(keySpy).toHaveBeenCalledWith(eventParam);
    });
    
    it('should not trigger key-specific listener for different keys', () => {
      const keySpy = jest.fn();
      eventSystem.onKeyExpiry('key1', keySpy);
      
      const eventParam = createEventParam('key2');
      eventSystem.emitEvent(EVENT.EXPIRE, eventParam);
      
      expect(keySpy).not.toHaveBeenCalled();
    });
    
    it('should throw an error when registering a listener with an empty key', () => {
      expect(() => eventSystem.onKeyExpiry('', jest.fn())).toThrow('Empty key');
    });
  });
  
  describe('Wildcard Events', () => {
    it('should register and trigger wildcard event listeners', () => {
      const wildcardSpy = jest.fn();
      eventSystem.onKeyExpiry('user:*:profile', wildcardSpy);
      
      const matchingEventParam = createEventParam('user:123:profile');
      eventSystem.emitEvent(EVENT.EXPIRE, matchingEventParam);
      
      expect(wildcardSpy).toHaveBeenCalledTimes(1);
      expect(wildcardSpy).toHaveBeenCalledWith(matchingEventParam);
      
      // Non-matching key should not trigger
      const nonMatchingEventParam = createEventParam('admin:123:profile');
      eventSystem.emitEvent(EVENT.EXPIRE, nonMatchingEventParam);
      
      expect(wildcardSpy).toHaveBeenCalledTimes(1); // Still just 1 call
    });
    
    it('should support multiple wildcards in patterns', () => {
      const multiWildcardSpy = jest.fn();
      eventSystem.onKeyExpiry('*:*:profile', multiWildcardSpy);
      
      // These should all match
      const userProfileParam = createEventParam('user:123:profile');
      const adminProfileParam = createEventParam('admin:456:profile');
      
      eventSystem.emitEvent(EVENT.EXPIRE, userProfileParam);
      eventSystem.emitEvent(EVENT.EXPIRE, adminProfileParam);
      
      expect(multiWildcardSpy).toHaveBeenCalledTimes(2);
      
      // This should not match
      const settingsParam = createEventParam('user:123:settings');
      eventSystem.emitEvent(EVENT.EXPIRE, settingsParam);
      
      expect(multiWildcardSpy).toHaveBeenCalledTimes(2); // Still just 2 calls
    });
  });
  
  describe('clearEventListeners', () => {
    it('should clear all event listeners when called without parameters', () => {
      const spy1 = jest.fn();
      const spy2 = jest.fn();
      
      eventSystem.onExpiry(spy1);
      eventSystem.onRefetch(spy2);
      
      const result = eventSystem.clearEventListeners();
      
      expect(result).toBe(true);
      
      eventSystem.emitEvent(EVENT.EXPIRE, createEventParam());
      eventSystem.emitEvent(EVENT.REFETCH, createEventParam());
      
      expect(spy1).not.toHaveBeenCalled();
      expect(spy2).not.toHaveBeenCalled();
    });
    
    it('should clear only specified event type listeners', () => {
      const expirySpy = jest.fn();
      const refetchSpy = jest.fn();
      
      eventSystem.onExpiry(expirySpy);
      eventSystem.onRefetch(refetchSpy);
      
      const result = eventSystem.clearEventListeners({ event: EVENT.EXPIRE });
      
      expect(result).toBe(true);
      
      eventSystem.emitEvent(EVENT.EXPIRE, createEventParam());
      eventSystem.emitEvent(EVENT.REFETCH, createEventParam());
      
      expect(expirySpy).not.toHaveBeenCalled();
      expect(refetchSpy).toHaveBeenCalledTimes(1);
    });
    
    it('should clear only specified key event listeners', () => {
      const key1Spy = jest.fn();
      const key2Spy = jest.fn();
      
      eventSystem.onKeyExpiry('key1', key1Spy);
      eventSystem.onKeyExpiry('key2', key2Spy);
      
      const result = eventSystem.clearEventListeners({ 
        event: EVENT.EXPIRE, 
        key: 'key1' 
      });
      
      expect(result).toBe(true);
      
      eventSystem.emitEvent(EVENT.EXPIRE, createEventParam('key1'));
      eventSystem.emitEvent(EVENT.EXPIRE, createEventParam('key2'));
      
      expect(key1Spy).not.toHaveBeenCalled();
      expect(key2Spy).toHaveBeenCalledTimes(1);
    });
    
    it('should throw an error when key is provided without event', () => {
      expect(() => eventSystem.clearEventListeners({ key: 'key1' })).toThrow(
        "`key` cannot be provided without `event`"
      );
    });
    
    it('should clear wildcard pattern listeners', () => {
      const wildcardSpy = jest.fn();
      eventSystem.onKeyExpiry('user:*:profile', wildcardSpy);
      
      const result = eventSystem.clearEventListeners({
        event: EVENT.EXPIRE,
        key: 'user:*:*'
      });
      
      expect(result).toBe(true);
      
      eventSystem.emitEvent(EVENT.EXPIRE, createEventParam('user:123:profile'));
      
      expect(wildcardSpy).not.toHaveBeenCalled();
    });
  });
}); 