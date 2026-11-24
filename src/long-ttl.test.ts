import { RunCache } from './run-cache';
import { validateTTL } from './core/utils';

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

describe('TTL handling', () => {
  afterEach(async () => {
    await RunCache.flush();
    await RunCache.clearEventListeners();
  });

  it('does not expire an entry with a TTL above the setTimeout limit', async () => {
    const onExpiry = jest.fn();
    await RunCache.onExpiry(onExpiry);
    await RunCache.set({ key: 'long', value: 'v', ttl: THIRTY_DAYS });

    await new Promise((resolve) => { setTimeout(resolve, 50); });

    expect(onExpiry).not.toHaveBeenCalled();
    expect(await RunCache.get('long')).toBe('v');
  });

  it('does not refetch in a loop when autoRefetch is used with a long TTL', async () => {
    let calls = 0;
    await RunCache.set({
      key: 'long-refetch',
      sourceFn: () => { calls += 1; return 'v'; },
      ttl: THIRTY_DAYS,
      autoRefetch: true,
    });

    await new Promise((resolve) => { setTimeout(resolve, 100); });

    expect(calls).toBe(1);
  });

  it('keeps refetched long-TTL entries from expiring early', async () => {
    let calls = 0;
    await RunCache.set({
      key: 'long-manual',
      sourceFn: () => { calls += 1; return `v${calls}`; },
      ttl: THIRTY_DAYS,
      autoRefetch: true,
    });
    await RunCache.refetch('long-manual');

    await new Promise((resolve) => { setTimeout(resolve, 50); });

    expect(calls).toBe(2);
    expect(await RunCache.get('long-manual')).toBe('v2');
  });

  describe('validation', () => {
    it.each([
      [Number.NaN, '`ttl` must be a number'],
      ['1000', '`ttl` must be a number'],
      [Number.POSITIVE_INFINITY, '`ttl` must be a finite number'],
      [0, '`ttl` cannot be negative'],
      [-1, '`ttl` cannot be negative'],
    ])('rejects ttl %p', async (ttl, message) => {
      await expect(RunCache.set({ key: 'bad', value: 'v', ttl: ttl as number })).rejects.toThrow(message);
      expect(() => validateTTL(ttl as number)).toThrow(message);
    });

    it('accepts very large finite TTLs', () => {
      expect(() => validateTTL(Number.MAX_SAFE_INTEGER)).not.toThrow();
    });
  });
});
