import {
  RunCache, EventParam, SourceFnError, MiddlewareError, RunCacheError,
} from './index';

describe('empty values and error reporting', () => {
  afterEach(async () => {
    await RunCache.flush();
    await RunCache.clearEventListeners();
    await RunCache.clearMiddleware();
  });

  describe('empty strings', () => {
    it('can be cached as a value', async () => {
      await expect(RunCache.set({ key: 'empty', value: '' })).resolves.toBe(true);
      expect(await RunCache.has('empty')).toBe(true);
      expect(await RunCache.get('empty')).toBe('');
    });

    it('can be returned by a source function, including on refetch', async () => {
      await RunCache.set({ key: 'empty-src', sourceFn: () => '' });
      expect(await RunCache.get('empty-src')).toBe('');
      await expect(RunCache.refetch('empty-src')).resolves.toBe(true);
      expect(await RunCache.get('empty-src')).toBe('');
    });

    it('still requires either a value or a source function', async () => {
      await expect(RunCache.set({ key: 'none' })).rejects.toThrow("`value` can't be empty without a `sourceFn`");
    });
  });

  describe('source function errors', () => {
    it('reports a source function that resolves to undefined', async () => {
      const error = await RunCache.set({ key: 'u', sourceFn: () => undefined as unknown as string })
        .catch((e) => e);

      expect(error).toBeInstanceOf(SourceFnError);
      expect(error.message).toBe("Source function returned undefined for key: 'u'");
      expect(error.key).toBe('u');
      expect(await RunCache.has('u')).toBe(false);
    });

    it('keeps the original error as cause when the source function throws', async () => {
      const original = new Error('HTTP 503');
      const error = await RunCache.set({ key: 'boom', sourceFn: () => { throw original; } })
        .catch((e) => e);

      expect(error).toBeInstanceOf(SourceFnError);
      expect(error).toBeInstanceOf(RunCacheError);
      expect(error.message).toBe("Source function failed for key: 'boom'");
      expect(error.cause).toBe(original);
    });

    it('keeps the original error as cause when a refetch fails', async () => {
      const original = new Error('timeout');
      let calls = 0;
      await RunCache.set({
        key: 'r',
        sourceFn: () => {
          calls += 1;
          if (calls > 1) throw original;
          return 'v';
        },
      });

      const error = await RunCache.refetch('r').catch((e) => e);
      expect(error).toBeInstanceOf(SourceFnError);
      expect(error.cause).toBe(original);
      expect(await RunCache.get('r')).toBe('v');
    });

    it('includes the original error in refetch_failure events', async () => {
      const original = new Error('upstream down');
      const failures: EventParam[] = [];
      await RunCache.onRefetchFailure((event) => { failures.push(event); });
      let calls = 0;
      await RunCache.set({
        key: 'f',
        sourceFn: () => {
          calls += 1;
          if (calls > 1) throw original;
          return 'v';
        },
      });

      await RunCache.refetch('f').catch(() => {});

      expect(failures).toHaveLength(1);
      expect(failures[0].error).toBe(original);
    });

    it('treats a refetch that resolves to undefined as a failure', async () => {
      const failures: EventParam[] = [];
      await RunCache.onRefetchFailure((event) => { failures.push(event); });
      let calls = 0;
      await RunCache.set({
        key: 'ru',
        sourceFn: () => {
          calls += 1;
          return (calls > 1 ? undefined : 'v') as string;
        },
      });

      const error = await RunCache.refetch('ru').catch((e) => e);
      expect(error).toBeInstanceOf(SourceFnError);
      expect(error.message).toBe("Source function returned undefined for key: 'ru'");
      expect(failures).toHaveLength(1);
      expect(await RunCache.get('ru')).toBe('v');
    });
  });

  describe('middleware errors', () => {
    it('keeps the original error as cause', async () => {
      const original = new Error('validation failed');
      await RunCache.use(async (value, context, next) => {
        if (context.operation === 'set') throw original;
        return next(value);
      });

      const error = await RunCache.set({ key: 'm', value: 'v' }).catch((e) => e);
      expect(error).toBeInstanceOf(MiddlewareError);
      expect(error.message).toBe("Middleware execution failed for key: 'm'");
      expect(error.cause).toBe(original);
    });

    it('reports middleware that produces undefined on get', async () => {
      await RunCache.set({ key: 'g', value: 'v' });
      await RunCache.use(async (value, context, next) => (
        context.operation === 'get' ? undefined as unknown as string : next(value)
      ));

      await expect(RunCache.get('g')).rejects.toBeInstanceOf(MiddlewareError);
    });
  });
});
