import { createExpiryTimer, MAX_TIMEOUT_MS } from './timer';

describe('createExpiryTimer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires once after a short delay', () => {
    const callback = jest.fn();
    createExpiryTimer(callback, 1000);

    jest.advanceTimersByTime(999);
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(10_000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('never passes a delay above the 32-bit limit to setTimeout', () => {
    const spy = jest.spyOn(global, 'setTimeout');
    createExpiryTimer(jest.fn(), MAX_TIMEOUT_MS * 3);

    const delays = spy.mock.calls.map(([, delay]) => delay as number);
    expect(Math.max(...delays)).toBeLessThanOrEqual(MAX_TIMEOUT_MS);
    spy.mockRestore();
  });

  it('waits the full duration for delays longer than the 32-bit limit', () => {
    const callback = jest.fn();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    createExpiryTimer(callback, thirtyDays);

    jest.advanceTimersByTime(1);
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(MAX_TIMEOUT_MS);
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(thirtyDays - MAX_TIMEOUT_MS - 2);
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('can be cleared before the first chunk elapses', () => {
    const callback = jest.fn();
    const timer = createExpiryTimer(callback, MAX_TIMEOUT_MS * 2);
    timer.clear();

    jest.advanceTimersByTime(MAX_TIMEOUT_MS * 3);
    expect(callback).not.toHaveBeenCalled();
  });

  it('can be cleared after re-arming for a later chunk', () => {
    const callback = jest.fn();
    const timer = createExpiryTimer(callback, MAX_TIMEOUT_MS * 2);

    jest.advanceTimersByTime(MAX_TIMEOUT_MS + 1);
    timer.clear();

    jest.advanceTimersByTime(MAX_TIMEOUT_MS * 2);
    expect(callback).not.toHaveBeenCalled();
  });

  it('allows clear() to be called more than once', () => {
    const timer = createExpiryTimer(jest.fn(), 100);
    timer.clear();
    expect(() => timer.clear()).not.toThrow();
  });
});
