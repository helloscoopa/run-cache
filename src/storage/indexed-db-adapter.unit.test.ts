import { IndexedDBAdapter } from './indexed-db-adapter';

/**
 * A hand-driven IndexedDB fake: each test decides when (and whether) the
 * open request, the store request and the transaction fire their callbacks.
 */
type Handler = ((event?: any) => void) | null;

interface FakeRequest {
  result: any;
  error: { message?: string } | null;
  onsuccess: Handler;
  onerror: Handler;
  onupgradeneeded?: Handler;
  onblocked?: Handler;
}

const makeRequest = (): FakeRequest => ({
  result: undefined,
  error: null,
  onsuccess: null,
  onerror: null,
  onupgradeneeded: null,
  onblocked: null,
});

const setup = () => {
  const storeRequest = makeRequest();
  const store = {
    put: jest.fn(() => storeRequest),
    get: jest.fn(() => storeRequest),
    delete: jest.fn(() => storeRequest),
  };
  const transaction = {
    objectStore: jest.fn(() => store),
    error: null as { message?: string } | null,
    onerror: null as Handler,
    onabort: null as Handler,
  };
  const db = {
    objectStoreNames: { contains: jest.fn(() => false) },
    createObjectStore: jest.fn(),
    transaction: jest.fn(() => transaction),
    close: jest.fn(),
    onclose: null as Handler,
    onversionchange: null as Handler,
  };
  const openRequest = makeRequest();
  const indexedDB = { open: jest.fn(() => openRequest) };

  (window as any).indexedDB = indexedDB;

  const connect = () => {
    openRequest.result = db;
    openRequest.onsuccess?.();
  };

  return {
    storeRequest, store, transaction, db, openRequest, indexedDB, connect,
  };
};

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('IndexedDBAdapter (lifecycle and error paths)', () => {
  let originalIndexedDB: any;

  beforeAll(() => {
    originalIndexedDB = window.indexedDB;
  });

  afterEach(() => {
    jest.useRealTimers();
    (window as any).indexedDB = originalIndexedDB;
  });

  it('throws when IndexedDB is not available', () => {
    (window as any).indexedDB = undefined;
    expect(() => new IndexedDBAdapter()).toThrow(
      'IndexedDBAdapter can only be used in browser environments with IndexedDB support',
    );
  });

  it('applies config defaults and overrides', () => {
    setup();
    const defaults = new IndexedDBAdapter();
    expect(defaults.autoSaveInterval).toBe(0);
    expect(defaults.autoLoadOnInit).toBe(true);

    const custom = new IndexedDBAdapter({ autoSaveInterval: 500, autoLoadOnInit: false });
    expect(custom.autoSaveInterval).toBe(500);
    expect(custom.autoLoadOnInit).toBe(false);
  });

  describe('onupgradeneeded', () => {
    it('creates the object store when it is missing', () => {
      const { openRequest, db } = setup();
      // eslint-disable-next-line no-new
      new IndexedDBAdapter();
      openRequest.result = db;
      db.objectStoreNames.contains.mockReturnValue(false);
      openRequest.onupgradeneeded?.();
      expect(db.createObjectStore).toHaveBeenCalledWith('cache-store', { keyPath: 'id' });
    });

    it('does not recreate an existing object store', () => {
      const { openRequest, db } = setup();
      // eslint-disable-next-line no-new
      new IndexedDBAdapter();
      openRequest.result = db;
      db.objectStoreNames.contains.mockReturnValue(true);
      openRequest.onupgradeneeded?.();
      expect(db.createObjectStore).not.toHaveBeenCalled();
    });
  });

  describe('connection failures', () => {
    it('rejects when the connection is blocked', async () => {
      const { openRequest } = setup();
      const adapter = new IndexedDBAdapter();
      openRequest.onblocked?.();
      await expect(adapter.load()).rejects.toThrow('IndexedDB connection blocked');
    });

    it('rejects with the request error message when opening fails', async () => {
      const { openRequest } = setup();
      const adapter = new IndexedDBAdapter();
      openRequest.error = { message: 'quota exceeded' };
      openRequest.onerror?.();
      await expect(adapter.save('x')).rejects.toThrow('Failed to open IndexedDB: quota exceeded');
    });

    it('uses "unknown error" when opening fails without an error', async () => {
      const { openRequest } = setup();
      const adapter = new IndexedDBAdapter();
      openRequest.onerror?.();
      await expect(adapter.clear()).rejects.toThrow('Failed to open IndexedDB: unknown error');
    });

    it('rejects when the connection times out', async () => {
      jest.useFakeTimers();
      setup();
      const adapter = new IndexedDBAdapter();
      const loading = adapter.load();
      jest.advanceTimersByTime(5000);
      await expect(loading).rejects.toThrow('IndexedDB connection timed out');
    });

    it('reports "unknown error" when opening throws a non-Error', async () => {
      const { indexedDB } = setup();
      indexedDB.open.mockImplementation(() => {
        // eslint-disable-next-line no-throw-literal
        throw 'not an error';
      });
      const adapter = new IndexedDBAdapter();
      await expect(adapter.save('x')).rejects.toThrow('Failed to save cache data to IndexedDB: unknown error');
      await expect(adapter.load()).rejects.toThrow('Failed to load cache data from IndexedDB: unknown error');
      await expect(adapter.clear()).rejects.toThrow('Failed to clear cache data from IndexedDB: unknown error');
    });
  });

  describe('connection reuse and lifecycle', () => {
    it('reuses an established connection', async () => {
      const {
        connect, indexedDB, storeRequest,
      } = setup();
      const adapter = new IndexedDBAdapter();
      connect();

      const first = adapter.load();
      await flush();
      storeRequest.result = undefined;
      storeRequest.onsuccess?.();
      await expect(first).resolves.toBeNull();

      const second = adapter.load();
      await flush();
      storeRequest.result = { data: 'stored' };
      storeRequest.onsuccess?.();
      await expect(second).resolves.toBe('stored');

      expect(indexedDB.open).toHaveBeenCalledTimes(1);
    });

    it('reconnects after the database closes', async () => {
      const { connect, db, indexedDB } = setup();
      const adapter = new IndexedDBAdapter();
      connect();
      db.onclose?.();

      adapter.load();
      expect(indexedDB.open).toHaveBeenCalledTimes(2);
    });

    it('closes and reconnects on a version change', async () => {
      const { connect, db, indexedDB } = setup();
      const adapter = new IndexedDBAdapter();
      connect();
      db.onversionchange?.();
      expect(db.close).toHaveBeenCalledTimes(1);

      // A second version change with no open connection is a no-op
      db.onversionchange?.();
      expect(db.close).toHaveBeenCalledTimes(1);

      adapter.load();
      expect(indexedDB.open).toHaveBeenCalledTimes(2);
    });

    it('close() releases the connection and is safe to call twice', async () => {
      const { connect, db, indexedDB } = setup();
      const adapter = new IndexedDBAdapter();
      connect();

      await adapter.close();
      await adapter.close();
      expect(db.close).toHaveBeenCalledTimes(1);

      adapter.load();
      expect(indexedDB.open).toHaveBeenCalledTimes(2);
    });
  });

  describe.each([
    ['save', (a: IndexedDBAdapter) => a.save('payload'), 'Failed to save to IndexedDB', 'Failed to save cache data to IndexedDB'],
    ['load', (a: IndexedDBAdapter) => a.load(), 'Failed to load from IndexedDB', 'Failed to load cache data from IndexedDB'],
    ['clear', (a: IndexedDBAdapter) => a.clear(), 'Failed to clear from IndexedDB', 'Failed to clear cache data from IndexedDB'],
  ])('%s', (_name, run, requestMessage, wrapperMessage) => {
    const start = async () => {
      const ctx = setup();
      const adapter = new IndexedDBAdapter({ storageKey: 'my-key' });
      ctx.connect();
      const promise = run(adapter) as Promise<unknown>;
      await flush();
      return { ...ctx, promise };
    };

    it('rejects when the request fails, with its message', async () => {
      const { storeRequest, promise } = await start();
      storeRequest.error = { message: 'boom' };
      storeRequest.onerror?.();
      await expect(promise).rejects.toThrow(`${requestMessage}: boom`);
    });

    it('rejects when the request fails without an error', async () => {
      const { storeRequest, promise } = await start();
      storeRequest.onerror?.();
      await expect(promise).rejects.toThrow(`${requestMessage}: unknown error`);
    });

    it('rejects when the transaction fails', async () => {
      const { transaction, promise } = await start();
      transaction.error = { message: 'tx broke' };
      transaction.onerror?.();
      await expect(promise).rejects.toThrow('Transaction failed: tx broke');
    });

    it('rejects when the transaction fails without an error', async () => {
      const { transaction, promise } = await start();
      transaction.onerror?.();
      await expect(promise).rejects.toThrow('Transaction failed: unknown error');
    });

    it('rejects when the transaction aborts', async () => {
      const { transaction, promise } = await start();
      transaction.error = { message: 'aborted' };
      transaction.onabort?.();
      await expect(promise).rejects.toThrow('Transaction aborted: aborted');
    });

    it('rejects when the transaction aborts without an error', async () => {
      const { transaction, promise } = await start();
      transaction.onabort?.();
      await expect(promise).rejects.toThrow('Transaction aborted: unknown error');
    });

    it('wraps connection errors with the operation name', async () => {
      setup();
      const adapter = new IndexedDBAdapter();
      // IndexedDB disappears before the connection is established
      await adapter.close();
      (adapter as any).dbPromise = null;
      (window as any).indexedDB = undefined;
      await expect(run(adapter)).rejects.toThrow(`${wrapperMessage}: IndexedDBAdapter can only be used`);
    });

    it('rejects with the original error when starting the transaction throws', async () => {
      const { connect, db } = setup();
      const adapter = new IndexedDBAdapter();
      connect();
      db.transaction.mockImplementation(() => {
        throw new Error('no store');
      });
      await expect(run(adapter)).rejects.toThrow('no store');
    });
  });

  it('uses the configured storage key', async () => {
    const { store, storeRequest, connect } = setup();
    const adapter = new IndexedDBAdapter({ storageKey: 'custom' });
    connect();

    const saving = adapter.save('data');
    await flush();
    storeRequest.onsuccess?.();
    await saving;
    expect(store.put).toHaveBeenCalledWith({ id: 'custom', data: 'data' });

    const clearing = adapter.clear();
    await flush();
    storeRequest.onsuccess?.();
    await clearing;
    expect(store.delete).toHaveBeenCalledWith('custom');
  });
});
