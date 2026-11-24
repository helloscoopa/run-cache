import { RunCache } from './run-cache';
import { CacheStore } from './core/cache-store';

const sleep = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });

describe('listener errors are isolated', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(async () => {
    await RunCache.flush();
    await RunCache.clearEventListeners();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleError.mockRestore();
    await RunCache.flush();
    await RunCache.clearEventListeners();
  });

  it('completes tag invalidation when a listener throws', async () => {
    await RunCache.set({ key: 't1', value: '1', tags: ['g'] });
    await RunCache.set({ key: 't2', value: '1', tags: ['g'] });
    await RunCache.onTagInvalidation(() => { throw new Error('listener'); });

    await expect(RunCache.invalidateByTag('g')).resolves.toBe(true);

    expect(await RunCache.has('t1')).toBe(false);
    expect(await RunCache.has('t2')).toBe(false);
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it('completes dependency invalidation when a listener throws', async () => {
    await RunCache.set({ key: 'parent', value: '1' });
    await RunCache.set({ key: 'child1', value: '1', dependencies: ['parent'] });
    await RunCache.set({ key: 'child2', value: '1', dependencies: ['child1'] });
    await RunCache.onDependencyInvalidation(() => { throw new Error('listener'); });

    await expect(RunCache.invalidateByDependency('parent')).resolves.toBe(true);

    expect(await RunCache.has('child1')).toBe(false);
    expect(await RunCache.has('child2')).toBe(false);
  });

  it('removes the entry before its invalidation listeners run', async () => {
    const store = await CacheStore.create();
    const cache = (store as unknown as { cache: Map<string, unknown> }).cache;
    await store.set({ key: 't', value: '1', tags: ['g'] });
    await store.set({ key: 'child', value: '1', dependencies: ['parent'] });
    const presentDuringEvent: boolean[] = [];
    store.onTagInvalidation((event) => { presentDuringEvent.push(cache.has(event.key)); });
    store.onDependencyInvalidation((event) => { presentDuringEvent.push(cache.has(event.key)); });

    store.invalidateByTag('g');
    store.invalidateByDependency('parent');

    expect(presentDuringEvent).toEqual([false, false]);
    await store.shutdown();
  });

  it('still calls the other listeners when one throws during a timer-driven expiry', async () => {
    const second = jest.fn();
    await RunCache.onExpiry(() => { throw new Error('first listener'); });
    await RunCache.onExpiry(second);
    await RunCache.set({ key: 'e', value: 'v', ttl: 20 });

    await sleep(50);

    expect(second).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('expire listener for key "e"'),
      expect.objectContaining({ message: 'first listener' }),
    );
  });

  it('isolates key-specific and wildcard listeners', async () => {
    const after = jest.fn();
    await RunCache.onKeyRefetch('r', () => { throw new Error('exact'); });
    await RunCache.onKeyRefetch('r*', () => { throw new Error('wildcard'); });
    await RunCache.onKeyRefetch('r', after);
    await RunCache.set({ key: 'r', sourceFn: () => 'v' });

    await expect(RunCache.refetch('r')).resolves.toBe(true);

    expect(after).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it('reports rejected async listeners instead of leaving unhandled rejections', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      await RunCache.onRefetch(async () => { throw new Error('async listener'); });
      await RunCache.set({ key: 'a', sourceFn: () => 'v' });
      await RunCache.refetch('a');
      await sleep(10);
    } finally {
      process.removeListener('unhandledRejection', unhandled);
    }

    expect(unhandled).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('refetch listener for key "a"'),
      expect.objectContaining({ message: 'async listener' }),
    );
  });
});
