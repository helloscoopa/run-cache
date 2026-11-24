import { RunCache } from './run-cache';

type Signal = 'SIGTERM' | 'SIGINT';
const SIGNALS: Signal[] = ['SIGTERM', 'SIGINT'];

const flushAsync = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  }
};

describe('process signal handlers', () => {
  let saved: Record<Signal, Function[]>;
  let killSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    // Start each test with no signal listeners so the assertions only see RunCache's own
    saved = {
      SIGTERM: process.listeners('SIGTERM'),
      SIGINT: process.listeners('SIGINT'),
    };
    SIGNALS.forEach((signal) => process.removeAllListeners(signal));
    killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(async () => {
    await RunCache.shutdown();
    killSpy.mockRestore();
    exitSpy.mockRestore();
    SIGNALS.forEach((signal) => {
      process.removeAllListeners(signal);
      saved[signal].forEach((listener) => process.on(signal, listener as () => void));
    });
  });

  it('does not register signal handlers when the module is imported', () => {
    const before = SIGNALS.map((signal) => process.listenerCount(signal));
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      require('./run-cache');
    });
    const after = SIGNALS.map((signal) => process.listenerCount(signal));
    expect(after).toEqual(before);
  });

  it('registers one handler per signal when opted in, and is idempotent', async () => {
    await RunCache.configure({ handleProcessSignals: true });
    await RunCache.configure({ handleProcessSignals: true });

    expect(process.listenerCount('SIGTERM')).toBe(1);
    expect(process.listenerCount('SIGINT')).toBe(1);
  });

  it('removes its handlers when opted out', async () => {
    await RunCache.configure({ handleProcessSignals: true });
    await RunCache.configure({ handleProcessSignals: false });

    expect(process.listenerCount('SIGTERM')).toBe(0);
    expect(process.listenerCount('SIGINT')).toBe(0);
  });

  it('removes its handlers on shutdown()', async () => {
    await RunCache.configure({ handleProcessSignals: true });
    await RunCache.shutdown();

    expect(process.listenerCount('SIGTERM')).toBe(0);
    expect(process.listenerCount('SIGINT')).toBe(0);
  });

  it.each(SIGNALS)('awaits shutdown() on %s, then re-raises the signal', async (signal) => {
    const order: string[] = [];
    const realShutdown = RunCache.shutdown.bind(RunCache);
    const shutdownSpy = jest.spyOn(RunCache, 'shutdown').mockImplementation(async () => {
      // Simulates a slow save to the storage adapter
      await new Promise((resolve) => { setTimeout(resolve, 20); });
      order.push('shutdown complete');
      await realShutdown();
    });
    killSpy.mockImplementation(() => { order.push('kill'); return true; });

    await RunCache.configure({ handleProcessSignals: true });
    process.emit(signal);
    await new Promise((resolve) => { setTimeout(resolve, 60); });
    shutdownSpy.mockRestore();

    expect(order).toEqual(['shutdown complete', 'kill']);
    expect(killSpy).toHaveBeenCalledWith(process.pid, signal);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('leaves termination to the application when it has its own listener', async () => {
    const appListener = jest.fn();
    process.on('SIGTERM', appListener);
    await RunCache.configure({ handleProcessSignals: true });

    process.emit('SIGTERM');
    await flushAsync();

    expect(appListener).toHaveBeenCalledTimes(1);
    expect(killSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('removes itself before shutting down so a second signal is not intercepted', async () => {
    await RunCache.configure({ handleProcessSignals: true });

    process.emit('SIGINT');
    expect(process.listenerCount('SIGINT')).toBe(0);
    expect(process.listenerCount('SIGTERM')).toBe(0);
    await flushAsync();
  });
});

describe('initialization', () => {
  it('serves concurrent first calls from a single initialized instance', async () => {
    await RunCache.shutdown();
    const results = await Promise.all([
      RunCache.set({ key: 'c1', value: 'one' }),
      RunCache.set({ key: 'c2', value: 'two' }),
      RunCache.get('c1'),
    ]);
    expect(results.slice(0, 2)).toEqual([true, true]);
    expect(await RunCache.get('c2')).toBe('two');
    await RunCache.flush();
  });

  it('serves a call made before the first initialization finished, even if shutdown() runs meanwhile', async () => {
    let Fresh: typeof RunCache | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      Fresh = require('./run-cache').RunCache;
    });
    const cache = Fresh as typeof RunCache;

    const pending = cache.set({ key: 'early', value: 'value' }); // initialization still in progress
    await cache.shutdown();

    await expect(pending).resolves.toBe(true);
    expect(await cache.get('early')).toBe('value');
    await cache.shutdown();
  });

  it('recovers when shutdown() runs repeatedly while initialization is pending', async () => {
    let Fresh: typeof RunCache | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      Fresh = require('./run-cache').RunCache;
    });
    const cache = Fresh as typeof RunCache;

    const pending = cache.has('anything');
    await Promise.all([cache.shutdown(), cache.shutdown()]);

    await expect(pending).resolves.toBe(false);
    await cache.shutdown();
  });
});
