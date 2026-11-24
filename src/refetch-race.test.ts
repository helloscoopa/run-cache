import { RunCache } from './run-cache';
import { CacheStore } from './core/cache-store';

const sleep = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** A sourceFn whose result is released manually, to control interleavings */
function deferredSource(values: string[]) {
  const releases: Array<() => void> = [];
  let call = 0;
  const sourceFn = jest.fn(() => {
    const value = values[Math.min(call, values.length - 1)];
    call += 1;
    if (call === 1) return value; // initial set() resolves immediately
    return new Promise<string>((resolve) => { releases.push(() => resolve(value)); });
  });
  const release = async () => {
    while (!releases.length) {
      await sleep(0);
    }
    releases.shift()?.();
    await sleep(0);
  };
  return { sourceFn, release };
}

describe('concurrent changes while a refetch is in flight', () => {
  afterEach(async () => {
    await RunCache.flush();
    await RunCache.clearEventListeners();
    await RunCache.clearMiddleware();
  });

  it('does not resurrect an entry deleted during refetch', async () => {
    const { sourceFn, release } = deferredSource(['v1', 'v2']);
    await RunCache.set({ key: 'r', sourceFn });

    const refetch = RunCache.refetch('r');
    await RunCache.delete('r');
    await release();

    await expect(refetch).resolves.toBe(false);
    expect(await RunCache.has('r')).toBe(false);
  });

  it('does not resurrect entries after flush()', async () => {
    const { sourceFn, release } = deferredSource(['v1', 'v2']);
    await RunCache.set({ key: 'r', sourceFn });

    const refetch = RunCache.refetch('r');
    await RunCache.flush();
    await release();
    await refetch;

    expect(await RunCache.has('r')).toBe(false);
  });

  it('does not resurrect entries removed by tag invalidation', async () => {
    const { sourceFn, release } = deferredSource(['v1', 'v2']);
    await RunCache.set({ key: 'r', sourceFn, tags: ['t'] });

    const refetch = RunCache.refetch('r');
    await RunCache.invalidateByTag('t');
    await release();
    await refetch;

    expect(await RunCache.has('r')).toBe(false);
  });

  it('keeps a value written by set() during refetch', async () => {
    const { sourceFn, release } = deferredSource(['v1', 'stale']);
    await RunCache.set({ key: 'r', sourceFn });

    const refetch = RunCache.refetch('r');
    await RunCache.set({ key: 'r', value: 'fresh' });
    await release();

    await expect(refetch).resolves.toBe(false);
    expect(await RunCache.get('r')).toBe('fresh');
  });

  it('does not leave a TTL timer behind for a discarded refetch', async () => {
    const onExpiry = jest.fn();
    await RunCache.onExpiry(onExpiry);
    const { sourceFn, release } = deferredSource(['v1', 'v2']);
    await RunCache.set({ key: 'r', sourceFn, ttl: 40 });

    const refetch = RunCache.refetch('r');
    await RunCache.delete('r');
    await release();
    await refetch;

    await sleep(100);
    expect(onExpiry).not.toHaveBeenCalled();
  });

  it('does not emit a refetch event for a discarded result', async () => {
    const onRefetch = jest.fn();
    await RunCache.onRefetch(onRefetch);
    const { sourceFn, release } = deferredSource(['v1', 'v2']);
    await RunCache.set({ key: 'r', sourceFn });

    const refetch = RunCache.refetch('r');
    await RunCache.delete('r');
    await release();
    await refetch;

    expect(onRefetch).not.toHaveBeenCalled();
  });

  it('does not resurrect an entry when the refetch fails after delete', async () => {
    let call = 0;
    let reject: (e: Error) => void = () => {};
    await RunCache.set({
      key: 'r',
      sourceFn: () => {
        call += 1;
        if (call === 1) return 'v1';
        return new Promise<string>((_, rej) => { reject = rej; });
      },
    });

    const refetch = RunCache.refetch('r');
    await RunCache.delete('r');
    reject(new Error('boom'));

    await expect(refetch).rejects.toThrow();
    expect(await RunCache.has('r')).toBe(false);
  });

  it('does not repopulate a store after shutdown()', async () => {
    const store = await CacheStore.create();
    const { sourceFn, release } = deferredSource(['v1', 'v2']);
    await store.set({ key: 'r', sourceFn });

    const refetch = store.refetch('r');
    await store.shutdown();
    await release();
    await refetch;

    expect(await store.has('r')).toBe(false);
  });

  it('still applies refetch results when nothing changed', async () => {
    const onRefetch = jest.fn();
    await RunCache.onRefetch(onRefetch);
    const { sourceFn, release } = deferredSource(['v1', 'v2']);
    await RunCache.set({ key: 'r', sourceFn });

    const refetch = RunCache.refetch('r');
    await release();

    await expect(refetch).resolves.toBe(true);
    expect(await RunCache.get('r')).toBe('v2');
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });
});

describe('overlapping set() calls for the same key', () => {
  afterEach(async () => {
    await RunCache.flush();
  });

  it('keeps the value from the set() that started last', async () => {
    let releaseSlow: (v: string) => void = () => {};
    const slow = RunCache.set({
      key: 'k',
      sourceFn: () => new Promise<string>((resolve) => { releaseSlow = resolve; }),
    });
    await RunCache.set({ key: 'k', value: 'newer' });

    releaseSlow('older');
    await expect(slow).resolves.toBe(false);
    expect(await RunCache.get('k')).toBe('newer');
  });

  it('does not block later set() calls after a failed set()', async () => {
    await expect(RunCache.set({
      key: 'k',
      sourceFn: () => { throw new Error('boom'); },
    })).rejects.toThrow();

    await expect(RunCache.set({ key: 'k', value: 'ok' })).resolves.toBe(true);
    expect(await RunCache.get('k')).toBe('ok');
  });
});
