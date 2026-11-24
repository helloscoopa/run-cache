import { CacheStore } from './core/cache-store';
import { EvictionPolicy } from './types/cache-config';
import { StorageAdapter } from './types/storage-adapter';

const sleep = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });

class MemoryAdapter implements StorageAdapter {
  data: string | null = null;

  saves = 0;

  constructor(public readonly autoSaveInterval?: number, public readonly autoLoadOnInit?: boolean) {}

  async save(data: string) { this.data = data; this.saves += 1; }

  async load() { return this.data; }

  async clear() { this.data = null; }
}

describe('restoring persisted entries', () => {
  const stores: CacheStore[] = [];
  const create = async (config: Parameters<typeof CacheStore.create>[0]) => {
    const store = await CacheStore.create(config);
    stores.push(store);
    return store;
  };

  afterEach(async () => {
    await Promise.all(stores.splice(0).map((store) => store.shutdown()));
  });

  it('re-arms TTL timers so restored entries expire', async () => {
    const adapter = new MemoryAdapter();
    const source = await create({ storageAdapter: adapter });
    await source.set({ key: 'k', value: 'v', ttl: 60 });
    await source.saveToStorage();

    const restored = await create({ storageAdapter: adapter });
    const onExpiry = jest.fn();
    restored.onExpiry(onExpiry);
    expect(await restored.get('k')).toBe('v');

    await sleep(100);
    expect(onExpiry).toHaveBeenCalledTimes(1);
    expect(onExpiry.mock.calls[0][0].key).toBe('k');
  });

  it('expires restored entries after the time remaining on the original TTL', async () => {
    const adapter = new MemoryAdapter();
    const source = await create({ storageAdapter: adapter });
    await source.set({ key: 'k', value: 'v', ttl: 200 });
    await source.saveToStorage();
    await sleep(120);

    const restored = await create({ storageAdapter: adapter });
    const onExpiry = jest.fn();
    restored.onExpiry(onExpiry);

    await sleep(130);
    expect(onExpiry).toHaveBeenCalledTimes(1);
  });

  it('skips entries that expired while they were in storage', async () => {
    const adapter = new MemoryAdapter();
    const source = await create({ storageAdapter: adapter });
    await source.set({ key: 'gone', value: 'v', ttl: 20 });
    await source.set({ key: 'kept', value: 'v' });
    await source.saveToStorage();
    await sleep(40);

    const restored = await create({ storageAdapter: adapter });
    const internal = (restored as unknown as { cache: Map<string, unknown> }).cache;
    expect(internal.has('gone')).toBe(false);
    expect(await restored.get('kept')).toBe('v');
  });

  it('does not write source function code to storage', async () => {
    const adapter = new MemoryAdapter();
    const store = await create({ storageAdapter: adapter });
    await store.set({ key: 'k', sourceFn: function secretLoader() { return 'v'; } });
    await store.saveToStorage();

    expect(adapter.data).not.toContain('secretLoader');
    expect(JSON.parse(adapter.data as string).entries.k.sourceFn).toBeUndefined();
  });

  it('keeps the runtime configuration instead of the stored one', async () => {
    const adapter = new MemoryAdapter();
    const source = await create({ storageAdapter: adapter, maxEntries: 5, evictionPolicy: EvictionPolicy.LFU });
    await source.set({ key: 'k', value: 'v' });
    await source.saveToStorage();

    const restored = await create({ storageAdapter: adapter, maxEntries: 100, evictionPolicy: EvictionPolicy.LRU });
    expect(restored.getConfig().maxEntries).toBe(100);
    expect(restored.getConfig().evictionPolicy).toBe(EvictionPolicy.LRU);
  });

  it('merges stored entries into the live cache, keeping live values', async () => {
    const adapter = new MemoryAdapter();
    const source = await create({ storageAdapter: adapter });
    await source.set({ key: 'shared', value: 'stored' });
    await source.set({ key: 'only-stored', value: 'stored' });
    await source.saveToStorage();

    const liveAdapter = new MemoryAdapter();
    const live = await create({ storageAdapter: liveAdapter });
    await live.set({ key: 'shared', value: 'live' });
    await live.set({ key: 'only-live', value: 'live' });
    liveAdapter.data = adapter.data;
    expect(await live.loadFromStorage()).toBe(true);

    expect(await live.get('shared')).toBe('live');
    expect(await live.get('only-live')).toBe('live');
    expect(await live.get('only-stored')).toBe('stored');
  });

  it('still reads data written by earlier versions that persisted sourceFn and config', async () => {
    const adapter = new MemoryAdapter();
    adapter.data = JSON.stringify({
      version: 1,
      timestamp: Date.now(),
      entries: {
        legacy: {
          value: 'v', createdAt: Date.now(), updatedAt: Date.now(), accessCount: 0, lastAccessed: Date.now(), sourceFn: '() => "x"',
        },
      },
      config: { maxEntries: 1, evictionPolicy: 'LFU' },
    });

    const restored = await create({ storageAdapter: adapter });
    expect(await restored.get('legacy')).toBe('v');
    expect(restored.getConfig().maxEntries).toBe(Number.POSITIVE_INFINITY);
  });

  describe('adapter options', () => {
    it('auto-saves at the adapter autoSaveInterval', async () => {
      const adapter = new MemoryAdapter(30);
      const store = await create({ storageAdapter: adapter });
      await store.set({ key: 'k', value: 'v' });

      await sleep(80);
      expect(adapter.saves).toBeGreaterThanOrEqual(1);
      expect(JSON.parse(adapter.data as string).entries.k.value).toBe('v');
    });

    it('does not load existing data when autoLoadOnInit is false', async () => {
      const source = new MemoryAdapter();
      const sourceStore = await create({ storageAdapter: source });
      await sourceStore.set({ key: 'k', value: 'v' });
      await sourceStore.saveToStorage();

      const adapter = new MemoryAdapter(undefined, false);
      adapter.data = source.data;
      const store = await create({ storageAdapter: adapter });

      expect(await store.has('k')).toBe(false);
      expect(await store.loadFromStorage()).toBe(true);
      expect(await store.get('k')).toBe('v');
    });
  });
});
