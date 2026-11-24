import { RunCache } from './run-cache';
import { StorageAdapter } from './types/storage-adapter';

describe('value round-trips through set()/get()', () => {
  beforeEach(async () => {
    await RunCache.flush();
    await RunCache.clearMiddleware();
  });

  afterAll(async () => {
    await RunCache.flush();
    await RunCache.clearMiddleware();
  });

  it.each([
    ['123'],
    ['007'],
    ['1e3'],
    ['true'],
    ['false'],
    ['null'],
    ['{"a":1}'],
    ['[1,2,3]'],
    ['"quoted"'],
    ['plain text'],
  ])('returns the string %p unchanged', async (value) => {
    await RunCache.set({ key: 'k', value });
    const result = await RunCache.get('k');
    expect(result).toBe(value);
    expect(typeof result).toBe('string');
  });

  it.each([
    [123],
    [0],
    [true],
    [false],
    [null],
    [{ a: 1, nested: { b: [1, 2] } }],
    [[1, 'two', { three: 3 }]],
  ])('restores the non-string value %p', async (value) => {
    await RunCache.set<unknown>({ key: 'k', value });
    expect(await RunCache.get('k')).toEqual(value);
  });

  it('keeps JSON-looking strings as strings for wildcard reads', async () => {
    await RunCache.set({ key: 'w:1', value: '123' });
    await RunCache.set<number>({ key: 'w:2', value: 456 });
    const results = await RunCache.get('w:*');
    expect(results).toEqual(expect.arrayContaining(['123', 456]));
    expect(results).toHaveLength(2);
  });

  describe('sourceFn', () => {
    it('serializes a non-string sourceFn result when no value is given', async () => {
      let seen: unknown;
      await RunCache.use(async (value, context, next) => {
        if (context.operation === 'set') seen = value;
        return next(value);
      });

      await RunCache.set<{ a: number }>({ key: 'o', sourceFn: () => ({ a: 1 }) });

      expect(typeof seen).toBe('string');
      expect(await RunCache.get('o')).toEqual({ a: 1 });
    });

    it('returns string sourceFn results unchanged', async () => {
      await RunCache.set({ key: 's', sourceFn: async () => '42' });
      expect(await RunCache.get('s')).toBe('42');
    });

    it('serializes non-string results on refetch', async () => {
      let n = 0;
      await RunCache.set<{ n: number }>({ key: 'r', sourceFn: () => ({ n: ++n }) });
      await RunCache.refetch('r');
      expect(await RunCache.get('r')).toEqual({ n: 2 });
    });

    it('tracks the value type per refetch result', async () => {
      const results: unknown[] = ['123', 123];
      await RunCache.set<unknown>({ key: 'mixed', sourceFn: () => results.shift() });
      expect(await RunCache.get('mixed')).toBe('123');
      await RunCache.refetch('mixed');
      expect(await RunCache.get('mixed')).toBe(123);
    });
  });

  it('deserializes after middleware so symmetric transforms keep working', async () => {
    await RunCache.use(async (value, context, next) => {
      if (context.operation === 'set' && value) return next(Buffer.from(value).toString('base64'));
      if (context.operation === 'get' && value) return Buffer.from(await next(value) as string, 'base64').toString('utf-8');
      return next(value);
    });

    await RunCache.set<{ a: number }>({ key: 'enc', value: { a: 1 } });
    await RunCache.set({ key: 'encs', value: '123' });

    expect(await RunCache.get('enc')).toEqual({ a: 1 });
    expect(await RunCache.get('encs')).toBe('123');
  });

  it('preserves the value type through persistence', async () => {
    let stored: string | null = null;
    const adapter: StorageAdapter = {
      save: async (data) => { stored = data; },
      load: async () => stored,
      clear: async () => { stored = null; },
    };
    const { CacheStore } = await import('./core/cache-store');
    const store = await CacheStore.create({ storageAdapter: adapter });
    await store.set({ key: 'str', value: '123' });
    await store.set({ key: 'num', value: 123 });
    await store.saveToStorage();

    const restored = await CacheStore.create({ storageAdapter: adapter });
    expect(await restored.getDeserialized('str')).toBe('123');
    expect(await restored.getDeserialized('num')).toBe(123);
    await store.shutdown();
    await restored.shutdown();
  });
});
