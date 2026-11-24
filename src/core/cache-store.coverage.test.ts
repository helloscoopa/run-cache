import { CacheStore } from './cache-store';
import { MiddlewareError } from './errors';
import { StorageAdapter } from '../types/storage-adapter';

const flushAsync = async () => {
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const memoryAdapter = (overrides: Partial<StorageAdapter> = {}): StorageAdapter & { data: string | null } => {
  const adapter: StorageAdapter & { data: string | null } = {
    data: null,
    autoLoadOnInit: false,
    async save(data: string) { adapter.data = data; },
    async load(): Promise<string | null> { return adapter.data; },
    async clear() { adapter.data = null; },
    ...overrides,
  };
  return adapter;
};

describe('CacheStore (edge and error paths)', () => {
  let store: CacheStore;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    store = await CacheStore.create();
    logSpy = jest.spyOn((store as any).logger, 'log');
  });

  afterEach(async () => {
    jest.useRealTimers();
    await store.shutdown();
  });

  const errorLogged = (fragment: string) => logSpy.mock.calls.some(
    ([level, message]) => level === 'error' && String(message).includes(fragment),
  );

  describe('empty-key guards', () => {
    it.each([
      'onKeyExpiry',
      'onKeyRefetch',
      'onKeyRefetchFailure',
      'onKeyTagInvalidation',
      'onKeyDependencyInvalidation',
    ] as const)('%s rejects an empty key', (method) => {
      expect(() => (store as any)[method]('', jest.fn())).toThrow('Empty key');
    });

    it('invalidateByTag returns false for an empty tag', () => {
      expect(store.invalidateByTag('')).toBe(false);
      expect(errorLogged('Empty tag provided to invalidateByTag')).toBe(true);
    });

    it('invalidateByDependency returns false for an empty key', () => {
      expect(store.invalidateByDependency('')).toBe(false);
      expect(errorLogged('Empty key provided to invalidateByDependency')).toBe(true);
    });

    it('isDependencyOf returns false for empty keys', async () => {
      await expect(store.isDependencyOf('', 'b')).resolves.toBe(false);
      await expect(store.isDependencyOf('a', '')).resolves.toBe(false);
    });
  });

  describe('set() validation', () => {
    it.each([
      ['tags that are not an array', { tags: 'user' }, '`tags` must be an array'],
      ['an empty tag', { tags: ['ok', '  '] }, 'Each tag must be a non-empty string'],
      ['a non-string tag', { tags: [42] }, 'Each tag must be a non-empty string'],
      ['duplicate tags', { tags: ['user', 'user'] }, 'Duplicate tag "user" detected'],
      ['dependencies that are not an array', { dependencies: 'dep' }, '`dependencies` must be an array'],
      ['an empty dependency', { dependencies: [''] }, 'Each dependency must be a non-empty string'],
      ['duplicate dependencies', { dependencies: ['d', 'd'] }, 'Duplicate dependency "d" detected'],
      ['a self-dependency', { dependencies: ['k'] }, 'A key cannot depend on itself'],
    ])('rejects %s', async (_label, extra, message) => {
      await expect(store.set({ key: 'k', value: 'v', ...(extra as any) })).rejects.toThrow(message);
      await expect(store.has('k')).resolves.toBe(false);
    });

    it('rejects a set when middleware returns undefined', async () => {
      store.use(async (value, ctx, next) => (ctx.operation === 'set' ? undefined : next(value)));
      const error = await store.set({ key: 'k', value: 'v' }).catch((e) => e);
      // set() wraps its own "returned undefined" error; the original is kept as the cause
      expect(error).toBeInstanceOf(MiddlewareError);
      expect(error.message).toBe("Middleware execution failed for key: 'k'");
      expect(error.cause.message).toBe("Middleware returned undefined for key: 'k'");
    });
  });

  describe('isDependencyOf', () => {
    it('returns false for an entry without dependencies', async () => {
      await store.set({ key: 'plain', value: 'v' });
      await expect(store.isDependencyOf('plain', 'x')).resolves.toBe(false);
    });

    it('returns false when no indirect path exists', async () => {
      await store.set({ key: 'root', value: 'r' });
      await store.set({ key: 'mid', value: 'm', dependencies: ['root'] });
      await store.set({ key: 'leaf', value: 'l', dependencies: ['mid'] });
      await expect(store.isDependencyOf('leaf', 'unrelated')).resolves.toBe(false);
    });

    it('stops at already-visited keys', async () => {
      await store.set({ key: 'a', value: 'a', dependencies: ['b'] });
      await expect(store.isDependencyOf('a', 'z', new Set(['a']))).resolves.toBe(false);
    });
  });

  describe('middleware', () => {
    it('rethrows a MiddlewareError raised by middleware unchanged', async () => {
      const original = new MiddlewareError('custom failure', 'k');
      await store.set({ key: 'k', value: 'v' });
      store.use(async (value, ctx, next) => {
        if (ctx.operation === 'get') throw original;
        return next(value);
      });
      await expect(store.get('k')).rejects.toBe(original);
    });

    it('skips keys whose read fails in a pattern get', async () => {
      await store.set({ key: 'p:ok', value: 'fine' });
      await store.set({ key: 'p:bad', value: 'boom' });
      store.use(async (value, ctx, next) => {
        if (ctx.operation === 'get' && ctx.key === 'p:bad') throw new Error('nope');
        return next(value);
      });

      const results = await store.get('p:*') as Array<string | undefined>;
      expect(results).toEqual(['fine']);
      expect(errorLogged('Error getting cache for key: p:bad')).toBe(true);
    });

    it('rejects a refetch when middleware returns undefined', async () => {
      await store.set({ key: 'r', sourceFn: async () => 'value' });
      store.use(async (value, ctx, next) => (ctx.operation === 'refetch' ? undefined : next(value)));
      await expect(store.refetch('r')).rejects.toThrow("Middleware returned undefined during refetch for key: 'r'");
    });

    it('discards a refetch result when the entry changes during middleware', async () => {
      await store.set({ key: 'r', sourceFn: async () => 'value' });
      store.use(async (value, ctx, next) => {
        if (ctx.operation === 'refetch') store.delete('r');
        return next(value);
      });
      await expect(store.refetch('r')).resolves.toBe(false);
      await expect(store.has('r')).resolves.toBe(false);
    });
  });

  describe('pattern refetch', () => {
    it('keeps going when one key fails, and reports success if any succeeded', async () => {
      await store.set({ key: 'job:ok', sourceFn: async () => 'ok' });
      let fail = false;
      await store.set({
        key: 'job:fail',
        sourceFn: async () => {
          if (fail) throw new Error('down');
          return 'first';
        },
      });
      fail = true;

      await expect(store.refetch('job:*')).resolves.toBe(true);
      expect(errorLogged('Failed to refetch key: job:fail')).toBe(true);
    });
  });

  describe('stale reads of auto-refetch entries', () => {
    it('serves the stale value once, refetches in the background, and skips duplicate refetches', async () => {
      jest.useFakeTimers();
      let resolveFetch: (v: string) => void = () => {};
      let calls = 0;
      await store.set({
        key: 'stale',
        ttl: 1000,
        autoRefetch: true,
        sourceFn: () => {
          calls += 1;
          if (calls === 1) return Promise.resolve('v1');
          return new Promise<string>((resolve) => { resolveFetch = resolve; });
        },
      });
      const onExpiry = jest.fn();
      store.onExpiry(onExpiry);

      // Move the clock past the TTL without firing the expiry timer
      jest.setSystemTime(Date.now() + 2000);

      await expect(store.get('stale')).resolves.toBe('v1');
      await flushAsync();
      // Second read while the background refetch is still pending
      await expect(store.get('stale')).resolves.toBe('v1');

      expect(calls).toBe(2);
      expect(onExpiry).toHaveBeenCalledTimes(1);

      resolveFetch('v2');
      await flushAsync();
      await expect(store.get('stale')).resolves.toBe('v2');
    });

    it('rejects a stale read when middleware returns undefined', async () => {
      jest.useFakeTimers();
      await store.set({
        key: 'stale', ttl: 1000, autoRefetch: true, sourceFn: async () => 'v',
      });
      store.use(async (value, ctx, next) => (ctx.operation === 'get' ? undefined : next(value)));
      jest.setSystemTime(Date.now() + 2000);

      await expect(store.get('stale')).rejects.toThrow("Middleware returned undefined for stale key: 'stale'");
    });

    it('logs a failed background refetch', async () => {
      jest.useFakeTimers();
      let fail = false;
      await store.set({
        key: 'stale',
        ttl: 1000,
        autoRefetch: true,
        sourceFn: async () => {
          if (fail) throw new Error('down');
          return 'v';
        },
      });
      fail = true;
      jest.setSystemTime(Date.now() + 2000);

      await store.get('stale');
      await flushAsync();
      expect(errorLogged('Background refetch failed for key: stale')).toBe(true);
    });
  });

  describe('TTL timers of refetched entries', () => {
    it('auto-refetches on expiry and logs failures', async () => {
      jest.useFakeTimers();
      let calls = 0;
      await store.set({
        key: 'auto',
        ttl: 1000,
        autoRefetch: true,
        sourceFn: async () => {
          calls += 1;
          if (calls >= 3) throw new Error('down');
          return `v${calls}`;
        },
      });
      await store.refetch('auto');

      jest.advanceTimersByTime(1001);
      await flushAsync();
      expect(errorLogged('Auto-refetch failed for key: auto')).toBe(true);
    });

    it('invalidates dependents when a refetched entry without autoRefetch expires', async () => {
      jest.useFakeTimers();
      await store.set({ key: 'base', ttl: 1000, sourceFn: async () => 'b' });
      await store.set({ key: 'derived', value: 'd', dependencies: ['base'] });
      await store.refetch('base');

      jest.advanceTimersByTime(1001);
      await flushAsync();

      await expect(store.has('derived')).resolves.toBe(false);
      // The refetched entry itself is kept for manual refetch
      expect((store as any).cache.has('base')).toBe(true);
    });
  });

  describe('storage', () => {
    it('loadFromStorage returns false without an adapter', async () => {
      await expect(store.loadFromStorage()).resolves.toBe(false);
    });

    it('saveToStorage returns false without an adapter', async () => {
      await expect(store.saveToStorage()).resolves.toBe(false);
    });

    it('keeps the current adapter when saving to it fails before a switch', async () => {
      const failing = memoryAdapter({ save: async () => { throw new Error('disk'); } });
      await store.configure({ storageAdapter: failing });

      await expect(store.configure({ storageAdapter: memoryAdapter() })).rejects.toThrow(
        'Failed to save cache data to the current storage adapter; the storage adapter was not changed',
      );
      expect(store.getConfig().storageAdapter).toBe(failing);
    });

    it('discards loaded data when the adapter is replaced during the load', async () => {
      let release: () => void = () => {};
      const slow = memoryAdapter({
        load: () => new Promise((resolve) => {
          release = () => resolve(JSON.stringify({ version: 1, entries: [] }));
        }),
      });
      await store.configure({ storageAdapter: slow });

      const loading = store.loadFromStorage();
      await store.configure({ storageAdapter: undefined });
      release();

      await expect(loading).resolves.toBe(false);
    });

    it('loadFromStorage returns false when the adapter fails', async () => {
      await store.configure({ storageAdapter: memoryAdapter({ load: async () => { throw new Error('io'); } }) });
      await expect(store.loadFromStorage()).resolves.toBe(false);
      expect(errorLogged('Failed to load cache data from storage')).toBe(true);
    });

    it.each([
      ['malformed JSON', '{not json', 'Failed to deserialize cache data:'],
      ['an unsupported version', JSON.stringify({ version: 2, entries: [] }), 'Unsupported cache data version: 2'],
    ])('rejects %s', async (_label, data, message) => {
      const adapter = memoryAdapter();
      adapter.data = data;
      await store.configure({ storageAdapter: adapter });
      await expect(store.loadFromStorage()).resolves.toBe(false);
      const loggedError = logSpy.mock.calls.find(([, msg]) => msg === 'Failed to load cache data from storage')?.[2];
      expect(String(loggedError)).toContain(message);
    });

    it('expires a restored entry immediately when no TTL is left', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      const adapter = memoryAdapter();
      // updatedAt + ttl === now: not yet expired when read, but no time left for a timer
      adapter.data = JSON.stringify({
        version: 1,
        entries: {
          edge: {
            value: 'x', createdAt: now - 50, updatedAt: now - 50, ttl: 50,
          },
        },
      });
      const onExpiry = jest.fn();
      store.onExpiry(onExpiry);
      await store.configure({ storageAdapter: adapter });

      await expect(store.loadFromStorage()).resolves.toBe(true);
      expect(onExpiry).toHaveBeenCalledWith(expect.objectContaining({ key: 'edge', value: 'x' }));
      await expect(store.has('edge')).resolves.toBe(false);
    });

    it('auto-refetches restored entries on expiry and logs failures', async () => {
      jest.useFakeTimers();
      const adapter = memoryAdapter();
      await store.configure({ storageAdapter: adapter });
      await store.set({
        key: 'restored', value: 'v', ttl: 1000, autoRefetch: true, sourceFn: async () => 'v',
      });
      // Arm the restore-time timer directly with a failing refetch
      const state = (store as any).cache.get('restored');
      state.interval?.clear();
      state.interval = undefined;
      state.sourceFn = async () => { throw new Error('down'); };
      (store as any).handleExpiry('restored', state);
      await flushAsync();
      expect(errorLogged('Auto-refetch failed for key: restored')).toBe(true);
    });

    it('logs failed auto-saves and keeps the interval running', async () => {
      jest.useFakeTimers();
      await store.configure({ storageAdapter: memoryAdapter({ save: async () => { throw new Error('disk'); } }) });
      store.setupAutoSave(100);
      jest.advanceTimersByTime(201);
      await flushAsync();
      const failures = logSpy.mock.calls.filter(([level, msg]) => level === 'error'
        && msg === 'Failed to save cache data to storage');
      expect(failures).toHaveLength(2);
    });

    it('logs save failures during shutdown', async () => {
      await store.configure({ storageAdapter: memoryAdapter({ save: async () => { throw new Error('disk'); } }) });
      await store.shutdown();
      expect(errorLogged('Failed to save cache data to storage')).toBe(true);
    });
  });
});
