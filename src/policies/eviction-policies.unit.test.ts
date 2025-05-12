import { LRUPolicy, LFUPolicy } from './eviction-policies';
import { CacheState } from '../types/cache-state';
import { Logger } from '../logging/logger';

describe('Eviction Policies', () => {
  let logger: Logger;
  let mockLoggerLog: jest.SpyInstance;
  
  beforeEach(() => {
    logger = new Logger({ verbose: false });
    mockLoggerLog = jest.spyOn(logger, 'log').mockImplementation();
  });
  
  afterEach(() => {
    mockLoggerLog.mockRestore();
  });
  
  // Create cache entries for testing
  function createTestEntries(): [string, CacheState][] {
    const now = Date.now();
    return [
      ['key1', { 
        value: 'value1', 
        createdAt: now - 1000, 
        updatedAt: now - 1000, 
        accessCount: 3,
        lastAccessed: now - 200
      }],
      ['key2', { 
        value: 'value2', 
        createdAt: now - 900, 
        updatedAt: now - 900, 
        accessCount: 1,
        lastAccessed: now - 500
      }],
      ['key3', { 
        value: 'value3', 
        createdAt: now - 800, 
        updatedAt: now - 800, 
        accessCount: 5,
        lastAccessed: now - 100
      }],
      ['key4', { 
        value: 'value4', 
        createdAt: now - 700, 
        updatedAt: now - 700, 
        accessCount: 0,
        lastAccessed: now - 700
      }],
    ];
  }
  
  describe('LRUPolicy', () => {
    let lruPolicy: LRUPolicy;
    
    beforeEach(() => {
      lruPolicy = new LRUPolicy(logger);
    });
    
    it('should evict least recently used entries first', () => {
      const entries = createTestEntries();
      
      // key4 has never been accessed, key2 has oldest lastAccessed time of the used ones
      const keysToEvict = lruPolicy.getEntriesToEvict(entries, 2);
      
      expect(keysToEvict).toHaveLength(2);
      expect(keysToEvict).toContain('key4'); // Never accessed
      expect(keysToEvict).toContain('key2'); // Least recently accessed
    });
    
    it('should evict based on creation time when lastAccessed is the same', () => {
      const now = Date.now();
      // Create entries with same lastAccessed but different creation times
      const entries: [string, CacheState][] = [
        ['key1', { value: 'value1', createdAt: now - 300, updatedAt: now, accessCount: 1, lastAccessed: now }],
        ['key2', { value: 'value2', createdAt: now - 200, updatedAt: now, accessCount: 1, lastAccessed: now }],
        ['key3', { value: 'value3', createdAt: now - 100, updatedAt: now, accessCount: 1, lastAccessed: now }],
      ];
      
      const keysToEvict = lruPolicy.getEntriesToEvict(entries, 1);
      
      expect(keysToEvict).toHaveLength(1);
      expect(keysToEvict[0]).toBe('key1'); // Oldest created
    });
    
    it('should evict exact number of requested entries', () => {
      const entries = createTestEntries();
      
      const keysToEvict1 = lruPolicy.getEntriesToEvict(entries, 1);
      expect(keysToEvict1).toHaveLength(1);
      
      const keysToEvict3 = lruPolicy.getEntriesToEvict(entries, 3);
      expect(keysToEvict3).toHaveLength(3);
    });
  });
  
  describe('LFUPolicy', () => {
    let lfuPolicy: LFUPolicy;
    
    beforeEach(() => {
      lfuPolicy = new LFUPolicy(logger);
    });
    
    it('should evict least frequently used entries first', () => {
      const entries = createTestEntries();
      
      // key4 has 0 accesses, key2 has 1 access
      const keysToEvict = lfuPolicy.getEntriesToEvict(entries, 2);
      
      expect(keysToEvict).toHaveLength(2);
      expect(keysToEvict).toContain('key4'); // Never accessed
      expect(keysToEvict).toContain('key2'); // Accessed just once
    });
    
    it('should evict based on lastAccessed time when access counts are the same', () => {
      const now = Date.now();
      // Create entries with same access count but different lastAccessed times
      const entries: [string, CacheState][] = [
        ['key1', { value: 'value1', createdAt: now, updatedAt: now, accessCount: 1, lastAccessed: now - 300 }],
        ['key2', { value: 'value2', createdAt: now, updatedAt: now, accessCount: 1, lastAccessed: now - 200 }],
        ['key3', { value: 'value3', createdAt: now, updatedAt: now, accessCount: 1, lastAccessed: now - 100 }],
      ];
      
      const keysToEvict = lfuPolicy.getEntriesToEvict(entries, 1);
      
      expect(keysToEvict).toHaveLength(1);
      expect(keysToEvict[0]).toBe('key1'); // Least recently accessed
    });
    
    it('should evict exact number of requested entries', () => {
      const entries = createTestEntries();
      
      const keysToEvict1 = lfuPolicy.getEntriesToEvict(entries, 1);
      expect(keysToEvict1).toHaveLength(1);
      
      const keysToEvict3 = lfuPolicy.getEntriesToEvict(entries, 3);
      expect(keysToEvict3).toHaveLength(3);
    });
  });
}); 