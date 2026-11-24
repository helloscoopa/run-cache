import { RunCache } from './run-cache';
import { CacheStore } from './core/cache-store';

const flushAsync = async () => {
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  }
};

describe('RunCache shutdown handlers (failure paths)', () => {
  let savedSigterm: Function[];
  let savedSigint: Function[];
  let killSpy: jest.SpyInstance;

  beforeEach(() => {
    savedSigterm = process.listeners('SIGTERM');
    savedSigint = process.listeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await RunCache.shutdown();
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    savedSigterm.forEach((l) => process.on('SIGTERM', l as () => void));
    savedSigint.forEach((l) => process.on('SIGINT', l as () => void));
  });

  it('logs a failed shutdown on a signal and still re-raises it', async () => {
    await RunCache.configure({ handleProcessSignals: true });
    const failure = new Error('save failed');
    jest.spyOn(RunCache, 'shutdown').mockRejectedValueOnce(failure);

    process.emit('SIGTERM');
    await flushAsync();

    expect(console.error).toHaveBeenCalledWith('RunCache: shutdown on SIGTERM failed', failure);
    expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });

  it('shuts down on beforeunload in browsers', async () => {
    await RunCache.configure({ handleProcessSignals: true });
    const shutdownSpy = jest.spyOn(RunCache, 'shutdown');

    window.dispatchEvent(new Event('beforeunload'));
    await flushAsync();

    expect(shutdownSpy).toHaveBeenCalled();
  });

  it('ignores a failed shutdown during beforeunload', async () => {
    await RunCache.configure({ handleProcessSignals: true });
    const shutdownSpy = jest.spyOn(RunCache, 'shutdown').mockRejectedValueOnce(new Error('unloading'));

    window.dispatchEvent(new Event('beforeunload'));
    await flushAsync();

    expect(shutdownSpy).toHaveBeenCalledTimes(1);
  });
});

describe('RunCache initialization failures', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    await RunCache.shutdown();
  });

  it('rejects when the store cannot be created, and retries on the next call', async () => {
    await RunCache.shutdown();
    const createSpy = jest.spyOn(CacheStore, 'create').mockRejectedValueOnce(new Error('broken'));

    await expect(RunCache.get('k')).rejects.toThrow('Failed to initialize RunCache storage');

    // The rejected promise is not cached, so the next call initializes again
    await expect(RunCache.set({ key: 'k', value: 'v' })).resolves.toBe(true);
    expect(await RunCache.get('k')).toBe('v');
    expect(createSpy).toHaveBeenCalledTimes(2);
  });

  it('starts over when shutdown() replaces a pending initialization that then fails', async () => {
    await RunCache.shutdown();
    let rejectFirst: (error: Error) => void = () => {};
    const realCreate = CacheStore.create.bind(CacheStore);
    const createSpy = jest.spyOn(CacheStore, 'create')
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject; }))
      .mockImplementation((config) => realCreate(config));

    const pending = RunCache.set({ key: 'later', value: 'ok' });
    await RunCache.shutdown();
    rejectFirst(new Error('first attempt failed'));

    await expect(pending).resolves.toBe(true);
    expect(await RunCache.get('later')).toBe('ok');
    expect(createSpy).toHaveBeenCalledTimes(2);
  });
});

describe('RunCache.setupAutoSave', () => {
  afterEach(async () => {
    await RunCache.shutdown();
  });

  it('delegates to the store', async () => {
    await RunCache.get('init');
    const storeSpy = jest.spyOn(CacheStore.prototype, 'setupAutoSave');

    await RunCache.setupAutoSave(0);

    expect(storeSpy).toHaveBeenCalledWith(0);
    storeSpy.mockRestore();
  });
});

describe('TypedCacheInterface event helpers', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    await RunCache.shutdown();
  });

  it('forwards every listener registration and refetch to RunCache', async () => {
    const typed = RunCache.createTypedCache<{ id: number }>();
    const cb = jest.fn();

    const calls: Array<[keyof typeof RunCache, () => Promise<unknown>, unknown[]]> = [
      ['onExpiry', () => typed.onExpiry(cb), [cb]],
      ['onKeyExpiry', () => typed.onKeyExpiry('a', cb), ['a', cb]],
      ['onRefetch', () => typed.onRefetch(cb), [cb]],
      ['onKeyRefetch', () => typed.onKeyRefetch('b', cb), ['b', cb]],
      ['onRefetchFailure', () => typed.onRefetchFailure(cb), [cb]],
      ['onKeyRefetchFailure', () => typed.onKeyRefetchFailure('c', cb), ['c', cb]],
    ];

    for (const [method, invoke, args] of calls) {
      const spy = jest.spyOn(RunCache, method as any);
      // eslint-disable-next-line no-await-in-loop
      await invoke();
      expect(spy).toHaveBeenCalledWith(...args);
    }
  });

  it('refetches through the static API', async () => {
    const typed = RunCache.createTypedCache<{ id: number }>();
    let id = 0;
    await typed.set({
      key: 'typed:refetch',
      sourceFn: async () => {
        id += 1;
        return { id };
      },
    });

    await expect(typed.refetch('typed:refetch')).resolves.toBe(true);
    expect(await typed.get('typed:refetch')).toEqual({ id: 2 });
  });

  it('delivers typed events to the registered listeners', async () => {
    const typed = RunCache.createTypedCache<{ id: number }>();
    const onRefetch = jest.fn();
    const onKeyRefetch = jest.fn();
    await typed.onRefetch(onRefetch);
    await typed.onKeyRefetch('typed:evt', onKeyRefetch);

    await typed.set({ key: 'typed:evt', sourceFn: async () => ({ id: 1 }) });
    await typed.refetch('typed:evt');
    await flushAsync();

    expect(onRefetch).toHaveBeenCalledWith(expect.objectContaining({ key: 'typed:evt' }));
    expect(onKeyRefetch).toHaveBeenCalledWith(expect.objectContaining({ key: 'typed:evt' }));
  });
});
