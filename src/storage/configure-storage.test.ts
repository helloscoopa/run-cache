import { RunCache } from '../run-cache';
import { StorageAdapter } from '../types/storage-adapter';

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
});
