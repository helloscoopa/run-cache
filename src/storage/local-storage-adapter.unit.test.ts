import { LocalStorageAdapter } from './local-storage-adapter';

describe('LocalStorageAdapter (non-Error failures)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const throwNonError = () => {
    // eslint-disable-next-line no-throw-literal
    throw 'not an error';
  };

  it('applies config overrides', () => {
    const adapter = new LocalStorageAdapter({ autoSaveInterval: 250, autoLoadOnInit: false });
    expect(adapter.autoSaveInterval).toBe(250);
    expect(adapter.autoLoadOnInit).toBe(false);
  });

  it('reports non-Error save failures as unknown', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(throwNonError);
    await expect(new LocalStorageAdapter().save('x')).rejects.toThrow(
      'Failed to save cache data to localStorage: unknown error',
    );
  });

  it('reports non-Error load failures as unknown', async () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(throwNonError);
    await expect(new LocalStorageAdapter().load()).rejects.toThrow(
      'Failed to load cache data from localStorage: unknown error',
    );
  });

  it('reports non-Error clear failures as unknown', async () => {
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(throwNonError);
    await expect(new LocalStorageAdapter().clear()).rejects.toThrow(
      'Failed to clear cache data from localStorage: unknown error',
    );
  });
});
