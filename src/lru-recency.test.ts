import { CacheStore } from './core/cache-store';
import { EvictionPolicy } from './types/cache-config';
import { LRUPolicy } from './policies/eviction-policies';
import { Logger } from './logging/logger';
import { CacheState } from './types/cache-state';

const tick = () => new Promise((resolve) => { setTimeout(resolve, 2); });

describe('LRU eviction order', () => {
  let store: CacheStore;

  beforeEach(async () => {
    store = await CacheStore.create({ maxEntries: 2, evictionPolicy: EvictionPolicy.LRU });
  });

  afterEach(async () => {
    jest.useRealTimers();
    await store.shutdown();
  });

  it('evicts the least recently used entry, not the newest unread one', async () => {
    await store.set({ key: 'old', value: '1' });
    await store.get('old');
    await tick();
    await store.set({ key: 'new', value: '2' });
    await tick();
    await store.set({ key: 'newest', value: '3' });

    expect(await store.has('old')).toBe(false);
    expect(await store.has('new')).toBe(true);
    expect(await store.has('newest')).toBe(true);
  });

  it('keeps recently written entries in a write-heavy workload', async () => {
    for (let i = 0; i < 5; i++) {
      await store.set({ key: `k${i}`, value: String(i) });
      await tick();
    }

    expect(await store.get('k3')).toBe('3');
    expect(await store.get('k4')).toBe('4');
  });

  it('treats overwriting a key as a use', async () => {
    await store.set({ key: 'a', value: '1' });
    await tick();
    await store.set({ key: 'b', value: '2' });
    await tick();
    await store.set({ key: 'a', value: '1b' }); // a is now more recent than b
    await tick();
    await store.set({ key: 'c', value: '3' });

    expect(await store.has('b')).toBe(false);
    expect(await store.get('a')).toBe('1b');
  });

  it('orders by actual recency when every operation happens in the same millisecond', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z')); // Date.now() is frozen

    await store.set({ key: 'old', value: '1' });
    await store.set({ key: 'new', value: '2' });
    await store.get('new');
    await store.get('old'); // old becomes the most recently used
    await store.set({ key: 'newest', value: '3' });

    expect(await store.has('new')).toBe(false);
    expect(await store.has('old')).toBe(true);
    expect(await store.has('newest')).toBe(true);
  });
});

describe('LRU ties within one millisecond', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the most recently used entry even if it was created first', async () => {
    jest.useFakeTimers();
    const store = await CacheStore.create({ maxEntries: 2, evictionPolicy: EvictionPolicy.LRU });
    jest.setSystemTime(1000);
    await store.set({ key: 'a', value: '1' });
    jest.setSystemTime(2000);
    await store.set({ key: 'b', value: '2' });
    jest.setSystemTime(3000);
    await store.get('b');
    await store.get('a'); // same millisecond, but after b: a is the most recently used
    await store.set({ key: 'c', value: '3' });

    expect(await store.has('a')).toBe(true);
    expect(await store.has('b')).toBe(false);
    await store.shutdown();
  });

  it('does not treat a refetch as a use', async () => {
    const store = await CacheStore.create({ maxEntries: 2, evictionPolicy: EvictionPolicy.LRU });
    await store.set({ key: 'refreshed', sourceFn: () => 'v' });
    await tick();
    await store.set({ key: 'written', value: 'w' });
    await tick();
    await store.refetch('refreshed'); // background refresh, not a use by the application
    await store.set({ key: 'new', value: 'n' });

    expect(await store.has('refreshed')).toBe(false);
    expect(await store.has('written')).toBe(true);
    await store.shutdown();
  });
});

describe('LRUPolicy', () => {
  it('does not prefer unread entries over older, read entries', () => {
    const policy = new LRUPolicy(new Logger({ debug: false }));
    const now = Date.now();
    const entry = (lastAccessed: number, accessCount: number): CacheState => ({
      value: 'v', createdAt: lastAccessed, updatedAt: lastAccessed, accessCount, lastAccessed,
    });
    const entries: [string, CacheState][] = [
      ['read-long-ago', entry(now - 10_000, 5)],
      ['written-just-now', entry(now, 0)],
    ];

    expect(policy.getEntriesToEvict(entries, 1)).toEqual(['read-long-ago']);
  });
});
