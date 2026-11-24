import { RunCache, EVENT } from './run-cache';

describe('RunCache.clearEventListeners()', () => {
  beforeEach(async () => {
    await RunCache.flush();
    await RunCache.clearEventListeners();
  });

  afterEach(async () => {
    await RunCache.flush();
    await RunCache.clearEventListeners();
  });

  /** Creates an entry whose next refetch fails */
  async function entryThatFailsOnRefetch(key: string) {
    let calls = 0;
    await RunCache.set({
      key,
      sourceFn: () => {
        calls += 1;
        if (calls > 1) throw new Error('refetch failed');
        return 'v';
      },
    });
  }

  it('keeps refetch_failure listeners when clearing refetch listeners', async () => {
    const onFailure = jest.fn();
    const onKeyFailure = jest.fn();
    const onRefetch = jest.fn();
    await RunCache.onRefetchFailure(onFailure);
    await RunCache.onKeyRefetchFailure('f', onKeyFailure);
    await RunCache.onRefetch(onRefetch);

    expect(await RunCache.clearEventListeners({ event: EVENT.REFETCH })).toBe(true);

    await entryThatFailsOnRefetch('f');
    await RunCache.refetch('f').catch(() => {});

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onKeyFailure).toHaveBeenCalledTimes(1);
  });

  it('still clears key-specific and wildcard listeners for the cleared event', async () => {
    const onKey = jest.fn();
    const onPattern = jest.fn();
    await RunCache.onKeyRefetch('r', onKey);
    await RunCache.onKeyRefetch('r*', onPattern);

    expect(await RunCache.clearEventListeners({ event: EVENT.REFETCH })).toBe(true);

    await RunCache.set({ key: 'r', sourceFn: () => 'v' });
    await RunCache.refetch('r');

    expect(onKey).not.toHaveBeenCalled();
    expect(onPattern).not.toHaveBeenCalled();
  });

  it('returns false when nothing was registered', async () => {
    expect(await RunCache.clearEventListeners()).toBe(false);
    expect(await RunCache.clearEventListeners({ event: EVENT.EXPIRE })).toBe(false);
    expect(await RunCache.clearEventListeners({ event: EVENT.EXPIRE, key: 'missing' })).toBe(false);
    expect(await RunCache.clearEventListeners({ event: EVENT.EXPIRE, key: 'missing:*' })).toBe(false);
    expect(await RunCache.clearEventListeners({ key: 'missing' })).toBe(false);
  });

  it('returns false for an event type whose name only shares a prefix with a registered one', async () => {
    await RunCache.onRefetchFailure(jest.fn());
    expect(await RunCache.clearEventListeners({ event: EVENT.REFETCH })).toBe(false);
  });

  it('returns true when listeners were removed', async () => {
    await RunCache.onExpiry(jest.fn());
    expect(await RunCache.clearEventListeners()).toBe(true);
  });

  it('clears listeners for a key across all events when only key is given', async () => {
    const onExpiry = jest.fn();
    const onRefetch = jest.fn();
    const onOther = jest.fn();
    await RunCache.onKeyExpiry('k', onExpiry);
    await RunCache.onKeyRefetch('k', onRefetch);
    await RunCache.onKeyRefetch('other', onOther);

    expect(await RunCache.clearEventListeners({ key: 'k' })).toBe(true);

    await RunCache.set({ key: 'k', sourceFn: () => 'v' });
    await RunCache.set({ key: 'other', sourceFn: () => 'v' });
    await RunCache.refetch('k');
    await RunCache.refetch('other');

    expect(onRefetch).not.toHaveBeenCalled();
    expect(onOther).toHaveBeenCalledTimes(1);
  });

  it('treats an options object that selects nothing as a no-op', async () => {
    const onExpiry = jest.fn();
    await RunCache.onExpiry(onExpiry);

    expect(await RunCache.clearEventListeners({})).toBe(false);
    expect(await RunCache.clearEventListeners({ event: undefined })).toBe(false);
    expect(await RunCache.clearEventListeners({ event: undefined, key: undefined })).toBe(false);

    await RunCache.set({ key: 'still', value: 'v', ttl: 10 });
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    expect(onExpiry).toHaveBeenCalledTimes(1);
  });

  it('does not clear wildcard listeners when clearing an exact key', async () => {
    const onPattern = jest.fn();
    await RunCache.onKeyRefetch('k*', onPattern);
    await RunCache.set({ key: 'k', sourceFn: () => 'v' });

    expect(await RunCache.clearEventListeners({ key: 'k' })).toBe(false);
    await RunCache.refetch('k');

    expect(onPattern).toHaveBeenCalledTimes(1);
  });
});
