import { RunCache } from '../run-cache';
import { StorageAdapter } from '../types/storage-adapter';
import { EvictionPolicy } from '../types/cache-config';

class MemoryAdapter implements StorageAdapter {
  public data: string | null = null;

  async save(data: string): Promise<void> {
    this.data = data;
  }

  async load(): Promise<string | null> {
    return this.data;
  }

  async clear(): Promise<void> {
    this.data = null;
  }
}

describe('RunCache.configure({ storageAdapter })', () => {
  afterEach(async () => {
    await RunCache.shutdown();
  });

  it('attaches the adapter so saveToStorage() persists entries', async () => {
    const adapter = new MemoryAdapter();
    await RunCache.configure({ storageAdapter: adapter });
    await RunCache.set({ key: 'a', value: 'x' });

    expect(await RunCache.saveToStorage()).toBe(true);
    expect(adapter.data).not.toBeNull();
    expect(JSON.parse(adapter.data as string).entries.a.value).toBe('x');
  });

  it('restores entries from the adapter with loadFromStorage()', async () => {
    const adapter = new MemoryAdapter();
    await RunCache.configure({ storageAdapter: adapter });
    await RunCache.set({ key: 'a', value: 'x' });
    await RunCache.saveToStorage();

    await RunCache.flush();
    expect(await RunCache.has('a')).toBe(false);

    expect(await RunCache.loadFromStorage()).toBe(true);
    expect(await RunCache.get('a')).toBe('x');
  });

  it('loads existing data when an adapter is configured', async () => {
    const source = new MemoryAdapter();
    await RunCache.configure({ storageAdapter: source });
    await RunCache.set({ key: 'persisted', value: 'v' });
    await RunCache.saveToStorage();
    await RunCache.shutdown();

    const adapter = new MemoryAdapter();
    adapter.data = source.data;
    await RunCache.configure({ storageAdapter: adapter });

    expect(await RunCache.get('persisted')).toBe('v');
  });

  it('saves to the previous adapter before switching to a new one', async () => {
    const first = new MemoryAdapter();
    const second = new MemoryAdapter();
    await RunCache.configure({ storageAdapter: first });
    await RunCache.set({ key: 'a', value: 'x' });

    await RunCache.configure({ storageAdapter: second });

    expect(first.data).not.toBeNull();
    expect(JSON.parse(first.data as string).entries.a.value).toBe('x');
  });

  it('detaches the adapter on shutdown', async () => {
    const adapter = new MemoryAdapter();
    await RunCache.configure({ storageAdapter: adapter });
    await RunCache.shutdown();

    expect(await RunCache.saveToStorage()).toBe(false);
  });

  it('keeps the current adapter, and rejects, when saving to it fails', async () => {
    const failing = new MemoryAdapter();
    const next = new MemoryAdapter();
    await RunCache.configure({ storageAdapter: failing });
    await RunCache.set({ key: 'unsaved', value: 'x' });
    failing.save = async () => { throw new Error('disk full'); };

    await expect(RunCache.configure({ storageAdapter: next })).rejects.toThrow(
      'storage adapter was not changed',
    );

    expect(await RunCache.get('unsaved')).toBe('x');
    expect((await RunCache.getConfig()).storageAdapter).toBe(failing);
    failing.save = async (data: string) => { failing.data = data; };
    expect(await RunCache.saveToStorage()).toBe(true);
    expect(JSON.parse(failing.data as string).entries.unsaved.value).toBe('x');
    expect(next.data).toBeNull();
  });

  it('applies the configuration passed in the same call, not the stored one', async () => {
    const source = new MemoryAdapter();
    await RunCache.configure({ storageAdapter: source, maxEntries: 2, evictionPolicy: EvictionPolicy.LRU });
    await RunCache.set({ key: 'a', value: 'x' });
    await RunCache.saveToStorage();
    await RunCache.shutdown();

    const adapter = new MemoryAdapter();
    adapter.data = source.data;
    await RunCache.configure({ storageAdapter: adapter, maxEntries: 100, evictionPolicy: EvictionPolicy.LFU });

    const config = await RunCache.getConfig();
    expect(config.maxEntries).toBe(100);
    expect(config.evictionPolicy).toBe(EvictionPolicy.LFU);
    expect(await RunCache.get('a')).toBe('x');
  });

  it('keeps the default maxEntries when restoring data saved with it', async () => {
    const source = new MemoryAdapter();
    await RunCache.configure({ storageAdapter: source });
    await RunCache.set({ key: 'a', value: 'x' });
    await RunCache.saveToStorage();
    await RunCache.shutdown();

    const adapter = new MemoryAdapter();
    adapter.data = source.data;
    await RunCache.configure({ storageAdapter: adapter });

    expect((await RunCache.getConfig()).maxEntries).toBe(Number.POSITIVE_INFINITY);
  });

  it('discards a load from an adapter that was replaced while it was loading', async () => {
    const stored = new MemoryAdapter();
    await RunCache.configure({ storageAdapter: stored });
    await RunCache.set({ key: 'from-slow', value: 'x' });
    await RunCache.saveToStorage();
    await RunCache.shutdown();

    const slow = new MemoryAdapter();
    slow.data = stored.data;
    slow.load = () => new Promise((resolve) => { setTimeout(() => resolve(stored.data), 30); });
    const fast = new MemoryAdapter();

    const first = RunCache.configure({ storageAdapter: slow });
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    await RunCache.configure({ storageAdapter: fast });
    await first;

    expect(await RunCache.has('from-slow')).toBe(false);
    expect((await RunCache.getConfig()).storageAdapter).toBe(fast);
  });
});
