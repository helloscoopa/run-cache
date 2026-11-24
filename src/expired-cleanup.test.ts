import { CacheStore } from './core/cache-store';
import { EvictionPolicy } from './types/cache-config';
import { StorageAdapter } from './types/storage-adapter';

const sleep = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Reads the store's internal map so tests can see entries that are never read */
const entries = (store: CacheStore): Map<string, unknown> => (store as unknown as { cache: Map<string, unknown> }).cache;

describe('expired entry cleanup', () => {
  let store: CacheStore;

  beforeEach(async () => {
    store = await CacheStore.create();
  });

  afterEach(async () => {
    await store.shutdown();
  });

  it('removes an entry from memory when its TTL elapses, even if it is never read', async () => {
    await store.set({ key: 'once', value: 'v', ttl: 20 });
    expect(entries(store).has('once')).toBe(true);

    await sleep(50);

    expect(entries(store).has('once')).toBe(false);
  });

  it('still emits the expire event before removing the entry', async () => {
    const onExpiry = jest.fn();
    store.onExpiry(onExpiry);
    await store.set({ key: 'evt', value: 'v', ttl: 20 });
    await sleep(50);

    expect(onExpiry).toHaveBeenCalledTimes(1);
    expect(entries(store).has('evt')).toBe(false);
  });

  it('keeps expired entries that have a sourceFn so they can be refetched manually', async () => {
    await store.set({ key: 'manual', sourceFn: () => 'v', ttl: 20 });
    await sleep(50);

    expect(entries(store).has('manual')).toBe(true);
    await expect(store.refetch('manual')).resolves.toBe(true);
    expect(await store.get('manual')).toBe('v');
  });

  it('keeps auto-refetched entries', async () => {
    let n = 0;
    await store.set({
      key: 'auto', sourceFn: () => `v${++n}`, ttl: 20, autoRefetch: true,
    });
    await sleep(50);

    expect(entries(store).has('auto')).toBe(true);
    expect(n).toBeGreaterThan(1);
  });

  it('does not remove an entry that was overwritten without a TTL', async () => {
    await store.set({ key: 'k', value: 'old', ttl: 20 });
    await store.set({ key: 'k', value: 'new' });
    await sleep(50);

    expect(await store.get('k')).toBe('new');
  });

  it('does not let a stray timer from a failed set() remove the existing entry', async () => {
    await store.set({ key: 'k', value: 'kept' });
    await expect(store.set({
      key: 'k', ttl: 20, sourceFn: () => { throw new Error('boom'); },
    })).rejects.toThrow();
    await sleep(50);

    expect(await store.get('k')).toBe('kept');
  });

  it('does not count expired entries against maxEntries', async () => {
    const limited = await CacheStore.create({ maxEntries: 2, evictionPolicy: EvictionPolicy.LRU });
    await limited.set({ key: 'short', value: '1', ttl: 20 });
    await limited.set({ key: 'live1', value: '2' });
    // Reading the short-lived entry makes it the most recently used, so the only
    // way live1 survives the next insert is if the expired entry is already gone
    await limited.get('short');
    await sleep(50);
    await limited.set({ key: 'live2', value: '3' });

    expect(await limited.get('live1')).toBe('2');
    expect(await limited.get('live2')).toBe('3');
    await limited.shutdown();
  });

  it('does not persist expired entries', async () => {
    let saved = '';
    const adapter: StorageAdapter = {
      save: async (data) => { saved = data; },
      load: async () => null,
      clear: async () => {},
    };
    const persistent = await CacheStore.create({ storageAdapter: adapter });
    await persistent.set({ key: 'live', value: 'v' });
    await persistent.set({ key: 'stale', value: 'v', ttl: 100 });

    jest.useFakeTimers();
    try {
      jest.setSystemTime(Date.now() + 1000); // expired, but its timer has not run
      await persistent.saveToStorage();
    } finally {
      jest.useRealTimers();
    }

    expect(Object.keys(JSON.parse(saved).entries)).toEqual(['live']);
    await persistent.shutdown();
  });

  describe('timers do not keep the process alive', () => {
    it('unrefs TTL timers', async () => {
      const handle = { unref: jest.fn() };
      const spy = jest.spyOn(global, 'setTimeout').mockReturnValue(handle as unknown as ReturnType<typeof setTimeout>);
      try {
        await store.set({ key: 't', value: 'v', ttl: 1000 });
      } finally {
        spy.mockRestore();
      }
      expect(handle.unref).toHaveBeenCalledTimes(1);
      entries(store).clear(); // the fake handle cannot be passed to clearTimeout
    });

    it('unrefs the auto-save interval', async () => {
      const adapter: StorageAdapter = { save: async () => {}, load: async () => null, clear: async () => {} };
      const persistent = await CacheStore.create({ storageAdapter: adapter });
      const handle = { unref: jest.fn() };
      const spy = jest.spyOn(global, 'setInterval').mockReturnValue(handle as unknown as ReturnType<typeof setInterval>);
      try {
        persistent.setupAutoSave(1000);
      } finally {
        spy.mockRestore();
      }
      expect(handle.unref).toHaveBeenCalledTimes(1);
      (persistent as unknown as { autoSaveInterval: unknown }).autoSaveInterval = null;
      await persistent.shutdown();
    });
  });
});
