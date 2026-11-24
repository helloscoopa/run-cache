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

  /** A sourceFn that resolves only when `release(value)` is called */
  function controlled() {
    let resolveValue: (value: string) => void = () => {};
    let markStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const sourceFn = () => new Promise<string>((resolve) => {
      resolveValue = resolve;
      markStarted();
    });
    // Waits until set() has actually called the source function before resolving it
    const release = async (value: string) => {
      await started;
      resolveValue(value);
    };
    return { sourceFn, release };
  }

  it('applies an earlier set() when a later set() fails in its sourceFn', async () => {
    const slow = controlled();
    const first = RunCache.set({ key: 'k', sourceFn: slow.sourceFn });
    await expect(RunCache.set({
      key: 'k', sourceFn: () => { throw new Error('boom'); },
    })).rejects.toThrow();

    slow.release('first');
    await expect(first).resolves.toBe(true);
    expect(await RunCache.get('k')).toBe('first');
  });

  it('applies an earlier set() when a later set() fails in middleware', async () => {
    const slow = controlled();
    const first = RunCache.set({ key: 'k', sourceFn: slow.sourceFn });
    await RunCache.use(async (value, context, next) => {
      if (context.operation === 'set' && value === 'rejected') throw new Error('invalid');
      return next(value);
    });
    await expect(RunCache.set({ key: 'k', value: 'rejected' })).rejects.toThrow();

    slow.release('first');
    await expect(first).resolves.toBe(true);
    expect(await RunCache.get('k')).toBe('first');
    await RunCache.clearMiddleware();
  });

  it('keeps the newest value when three set() calls overlap', async () => {
    const a = controlled();
    const b = controlled();
    const first = RunCache.set({ key: 'k', sourceFn: a.sourceFn });
    const second = RunCache.set({ key: 'k', sourceFn: b.sourceFn });
    await RunCache.set({ key: 'k', value: 'third' });

    b.release('second');
    a.release('first');

    await expect(second).resolves.toBe(false);
    await expect(first).resolves.toBe(false);
    expect(await RunCache.get('k')).toBe('third');
  });

  it('lets a later set() overwrite an earlier one that finished first', async () => {
    const a = controlled();
    const b = controlled();
    const first = RunCache.set({ key: 'k', sourceFn: a.sourceFn });
    const second = RunCache.set({ key: 'k', sourceFn: b.sourceFn });

    a.release('first');
    await expect(first).resolves.toBe(true);
    b.release('second');
    await expect(second).resolves.toBe(true);
    expect(await RunCache.get('k')).toBe('second');
  });

  it('writes an in-flight set() even if the key is deleted or flushed meanwhile', async () => {
    // Intended: delete() and flush() act on what is cached at the time they run.
    // A set() that is still fetching its value has not written anything yet, so it
    // completes normally; it is the most recent write for the key.
    const slow = controlled();
    const pending = RunCache.set({ key: 'k', sourceFn: slow.sourceFn });
    await RunCache.delete('k');
    await RunCache.flush();

    slow.release('value');
    await expect(pending).resolves.toBe(true);
    expect(await RunCache.get('k')).toBe('value');
  });

  it('drops per-key ordering state once no set() is in flight', async () => {
    const store = await CacheStore.create();
    const internals = store as unknown as { inFlightSets: Map<string, number>; appliedSets: Map<string, number> };
    const slow = controlled();
    const first = store.set({ key: 'k', sourceFn: slow.sourceFn });
    await store.set({ key: 'k', value: 'v' });
    await expect(store.set({ key: 'other', sourceFn: () => { throw new Error('x'); } })).rejects.toThrow();
    slow.release('old');
    await first;

    expect(internals.inFlightSets.size).toBe(0);
    expect(internals.appliedSets.size).toBe(0);
    await store.shutdown();
  });
});
