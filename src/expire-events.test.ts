import { RunCache, EventParam } from './run-cache';

const sleep = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });

describe('expire events', () => {
  let events: EventParam[];

  beforeEach(async () => {
    events = [];
    await RunCache.onExpiry((event) => { events.push(event); });
  });

  afterEach(async () => {
    jest.useRealTimers();
    await RunCache.flush();
    await RunCache.clearEventListeners();
    await RunCache.clearMiddleware();
  });

  it('reports the value produced by sourceFn, not "undefined"', async () => {
    await RunCache.set({ key: 'e', sourceFn: () => 'val', ttl: 20 });
    await sleep(50);

    expect(events).toHaveLength(1);
    expect(events[0].value).toBe('val');
  });

  it('reports the stored (post-middleware) value', async () => {
    await RunCache.use(async (value, context, next) => (
      context.operation === 'set' ? next(`stored:${value}`) : next(value)
    ));
    await RunCache.set({ key: 'm', value: 'raw', ttl: 20 });
    await sleep(50);

    expect(events.map((e) => e.value)).toEqual(['stored:raw']);
  });

  it('includes the entry TTL', async () => {
    const keyEvents: EventParam[] = [];
    await RunCache.onKeyExpiry('t', (event) => { keyEvents.push(event); });
    await RunCache.set({ key: 't', value: 'v', ttl: 20 });
    await sleep(50);

    expect(events[0].ttl).toBe(20);
    expect(keyEvents[0].ttl).toBe(20);
  });

  it('fires once when has() is called after the timer has fired', async () => {
    await RunCache.set({ key: 'h', value: 'v', ttl: 20 });
    await sleep(50);
    expect(await RunCache.has('h')).toBe(false);

    expect(events).toHaveLength(1);
  });

  it('fires once when the expiry is noticed by has() before the timer', async () => {
    jest.useFakeTimers();
    await RunCache.set({ key: 'lazy', value: 'v', ttl: 100 });
    jest.setSystemTime(Date.now() + 1000); // time moves on, but the timer has not run yet

    expect(await RunCache.has('lazy')).toBe(false);
    jest.runOnlyPendingTimers();

    expect(events).toHaveLength(1);
    expect(events[0].key).toBe('lazy');
  });

  it('fires once when the expiry is noticed by get() before the timer', async () => {
    jest.useFakeTimers();
    await RunCache.set({ key: 'lazy-get', value: 'v', ttl: 100 });
    jest.setSystemTime(Date.now() + 1000);

    expect(await RunCache.get('lazy-get')).toBeUndefined();
    jest.runOnlyPendingTimers();

    expect(events).toHaveLength(1);
  });

  it('fires again for each new expiry of an auto-refetched entry', async () => {
    let n = 0;
    await RunCache.set({
      key: 'auto', sourceFn: () => `v${++n}`, ttl: 25, autoRefetch: true,
    });
    await sleep(40);
    await sleep(40);

    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].value).toBe('v1');
    expect(events[1].value).toBe('v2');
    expect(new Set(events.map((e) => e.updatedAt)).size).toBe(events.length);
  });

  it('does not fire for an entry that was overwritten before its TTL elapsed', async () => {
    await RunCache.set({ key: 'o', value: 'first', ttl: 20 });
    await RunCache.set({ key: 'o', value: 'second' });
    await sleep(50);

    expect(events).toHaveLength(0);
  });

  it('includes the TTL in refetch events', async () => {
    const refetched: EventParam[] = [];
    await RunCache.onRefetch((event) => { refetched.push(event); });
    await RunCache.set({ key: 'r', sourceFn: () => 'v', ttl: 5000 });
    await RunCache.refetch('r');

    expect(refetched[0].ttl).toBe(5000);
  });
});
