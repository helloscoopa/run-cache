import { RunCache, EventParam } from './run-cache';

const sleep = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });

describe('a set() that fails', () => {
  let expired: EventParam[];

  beforeEach(async () => {
    expired = [];
    await RunCache.onExpiry((event) => { expired.push(event); });
  });

  afterEach(async () => {
    await RunCache.flush();
    await RunCache.clearEventListeners();
    await RunCache.clearMiddleware();
  });

  it('does not schedule an expiry for an entry that was never written', async () => {
    await expect(RunCache.set({
      key: 'never', ttl: 20, sourceFn: () => { throw new Error('boom'); },
    })).rejects.toThrow();
    await sleep(50);

    expect(expired).toHaveLength(0);
    expect(await RunCache.has('never')).toBe(false);
  });

  it('does not start auto-refetching an entry that was never written', async () => {
    let calls = 0;
    await expect(RunCache.set({
      key: 'never-auto',
      ttl: 20,
      autoRefetch: true,
      sourceFn: () => { calls += 1; throw new Error('boom'); },
    })).rejects.toThrow();
    await sleep(50);

    expect(calls).toBe(1);
  });

  it('keeps the existing entry\'s expiry timer when a sourceFn overwrite fails', async () => {
    await RunCache.set({ key: 'k', value: 'original', ttl: 30 });
    await expect(RunCache.set({
      key: 'k', ttl: 5000, sourceFn: () => { throw new Error('boom'); },
    })).rejects.toThrow();
    await sleep(60);

    expect(expired.map((e) => e.key)).toEqual(['k']);
    expect(expired[0].value).toBe('original');
    expect(await RunCache.has('k')).toBe(false);
  });

  it('keeps the existing entry\'s expiry timer when middleware fails', async () => {
    await RunCache.set({ key: 'k', value: 'original', ttl: 30 });
    await RunCache.use(async (value, context, next) => {
      if (context.operation === 'set') throw new Error('rejected');
      return next(value);
    });
    await expect(RunCache.set({ key: 'k', value: 'next', ttl: 5000 })).rejects.toThrow();
    await sleep(60);

    expect(expired.map((e) => e.value)).toEqual(['original']);
  });

  it('keeps an existing auto-refetched entry refreshing after a failed overwrite', async () => {
    let n = 0;
    await RunCache.set({
      key: 'auto', ttl: 25, autoRefetch: true, sourceFn: () => `v${++n}`,
    });
    await expect(RunCache.set({
      key: 'auto', ttl: 25, sourceFn: () => { throw new Error('boom'); },
    })).rejects.toThrow();
    await sleep(80);

    expect(n).toBeGreaterThan(1);
  });

  it('still replaces the timer when the overwrite succeeds', async () => {
    await RunCache.set({ key: 'k', value: 'first', ttl: 20 });
    await RunCache.set({ key: 'k', sourceFn: async () => 'second', ttl: 5000 });
    await sleep(50);

    expect(expired).toHaveLength(0);
    expect(await RunCache.get('k')).toBe('second');
  });
});
