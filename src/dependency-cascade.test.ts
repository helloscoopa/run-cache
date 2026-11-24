import { RunCache, EventParam, EvictionPolicy } from './run-cache';
import { CacheStore } from './core/cache-store';

const sleep = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });

describe('dependency invalidation cascades', () => {
  let events: EventParam[];

  beforeEach(async () => {
    events = [];
    await RunCache.flush();
    await RunCache.clearEventListeners();
    await RunCache.onDependencyInvalidation((event) => { events.push(event); });
  });

  afterEach(async () => {
    await RunCache.configure({ maxEntries: Number.POSITIVE_INFINITY, evictionPolicy: EvictionPolicy.NONE });
    await RunCache.flush();
    await RunCache.clearEventListeners();
  });

  /** parent <- child <- grandchild, plus an unrelated entry */
  async function chain(parent: Parameters<typeof RunCache.set>[0] = { key: 'parent', value: 'one' }) {
    await RunCache.set(parent);
    await RunCache.set({ key: 'child', value: 'c', dependencies: ['parent'] });
    await RunCache.set({ key: 'grandchild', value: 'g', dependencies: ['child'] });
    await RunCache.set({ key: 'unrelated', value: 'u' });
  }

  async function expectDependentsInvalidated() {
    expect(await RunCache.has('child')).toBe(false);
    expect(await RunCache.has('grandchild')).toBe(false);
    expect(await RunCache.has('unrelated')).toBe(true);
    expect(events.map((e) => e.key).sort()).toEqual(['child', 'grandchild']);
    expect(events.every((e) => e.dependencyKey === 'parent')).toBe(true);
  }

  it('when the parent is updated with set()', async () => {
    await chain();
    await RunCache.set({ key: 'parent', value: 'two' });

    await expectDependentsInvalidated();
    expect(await RunCache.get('parent')).toBe('two');
  });

  it('when the parent is deleted', async () => {
    await chain();
    await RunCache.delete('parent');

    await expectDependentsInvalidated();
  });

  it('when the parent is deleted by a wildcard pattern', async () => {
    await chain();
    await RunCache.delete('par*');

    await expectDependentsInvalidated();
  });

  it('when the parent is refetched manually', async () => {
    await chain({ key: 'parent', sourceFn: () => 'fresh' });
    await RunCache.refetch('parent');

    await expectDependentsInvalidated();
  });

  it('when the parent is refetched automatically after its TTL', async () => {
    let n = 0;
    await chain({
      key: 'parent', sourceFn: () => `v${++n}`, ttl: 20, autoRefetch: true,
    });
    await sleep(50);

    expect(n).toBeGreaterThan(1);
    await expectDependentsInvalidated();
  });

  it('when the parent expires', async () => {
    await chain({ key: 'parent', value: '1', ttl: 20 });
    await sleep(50);

    await expectDependentsInvalidated();
  });

  it('when an expired parent is removed by has()', async () => {
    jest.useFakeTimers();
    try {
      await chain({ key: 'parent', value: '1', ttl: 100 });
      jest.setSystemTime(Date.now() + 1000); // expired, timer not yet run
      expect(await RunCache.has('parent')).toBe(false);
    } finally {
      jest.useRealTimers();
    }

    await expectDependentsInvalidated();
  });

  it('when the parent is evicted', async () => {
    await RunCache.configure({ maxEntries: 4, evictionPolicy: EvictionPolicy.LRU });
    await chain();
    await sleep(2);
    await RunCache.get('child');
    await RunCache.get('grandchild');
    await RunCache.get('unrelated');
    await sleep(2);
    await RunCache.set({ key: 'extra', value: 'x' }); // evicts parent, the least recently used

    expect(await RunCache.has('parent')).toBe(false);
    expect(await RunCache.has('child')).toBe(false);
    expect(await RunCache.has('grandchild')).toBe(false);
  });

  it('when the parent is invalidated by tag', async () => {
    await chain({ key: 'parent', value: '1', tags: ['t'] });
    await RunCache.invalidateByTag('t');

    await expectDependentsInvalidated();
  });

  it('invalidateByDependency() still leaves the parent in place', async () => {
    await chain();
    expect(await RunCache.invalidateByDependency('parent')).toBe(true);

    expect(await RunCache.get('parent')).toBe('one');
    await expectDependentsInvalidated();
  });

  it('does not invalidate anything when the parent is set for the first time', async () => {
    await RunCache.set({ key: 'child', value: 'c', dependencies: ['parent'] });
    await RunCache.set({ key: 'parent', value: '1' });

    expect(await RunCache.get('child')).toBe('c');
    expect(events).toHaveLength(0);
  });

  it('invalidates all dependents of a diamond exactly once', async () => {
    await RunCache.set({ key: 'root', value: 'r' });
    await RunCache.set({ key: 'left', value: 'l', dependencies: ['root'] });
    await RunCache.set({ key: 'right', value: 'r', dependencies: ['root'] });
    await RunCache.set({ key: 'bottom', value: 'b', dependencies: ['left', 'right'] });

    await RunCache.delete('root');

    expect(events.map((e) => e.key).sort()).toEqual(['bottom', 'left', 'right']);
  });
});

describe('dependency cycles', () => {
  afterEach(async () => {
    await RunCache.flush();
  });

  it('rejects a two-step cycle', async () => {
    await RunCache.set({ key: 'a', value: '1', dependencies: ['b'] });
    await expect(RunCache.set({ key: 'b', value: '2', dependencies: ['a'] }))
      .rejects.toThrow('Circular dependency detected');
    expect(await RunCache.has('b')).toBe(false);
  });

  it('rejects a longer cycle', async () => {
    await RunCache.set({ key: 'a', value: '1', dependencies: ['b'] });
    await RunCache.set({ key: 'b', value: '2', dependencies: ['c'] });
    await expect(RunCache.set({ key: 'c', value: '3', dependencies: ['a'] }))
      .rejects.toThrow('Circular dependency detected');
  });

  it('allows shared dependencies that are not cycles', async () => {
    await RunCache.set({ key: 'base', value: '1' });
    await RunCache.set({ key: 'x', value: '2', dependencies: ['base'] });
    await expect(RunCache.set({ key: 'y', value: '3', dependencies: ['base', 'x'] })).resolves.toBe(true);
  });
});

describe('isDependencyOf()', () => {
  it('has no side effects on entries or events', async () => {
    const store = await CacheStore.create();
    const cache = (store as unknown as { cache: Map<string, { accessCount: number }> }).cache;
    const onExpiry = jest.fn();
    store.onExpiry(onExpiry);
    await store.set({ key: 'parent', value: '1' });
    await store.set({ key: 'child', value: 'c', dependencies: ['parent'] });

    expect(await store.isDependencyOf('child', 'parent')).toBe(true);
    expect(cache.get('child')?.accessCount).toBe(0);

    jest.useFakeTimers();
    try {
      await store.set({ key: 'stale', value: 's', ttl: 100, dependencies: ['parent'] });
      jest.setSystemTime(Date.now() + 1000);
      expect(await store.isDependencyOf('stale', 'parent')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
    expect(onExpiry).not.toHaveBeenCalled();
    expect(cache.has('stale')).toBe(true);
    await store.shutdown();
  });
});
