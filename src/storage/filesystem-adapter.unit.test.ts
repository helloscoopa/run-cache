import * as path from 'path';
import { FilesystemAdapter } from './filesystem-adapter';

/**
 * Unit tests for FilesystemAdapter error handling. A fake `fs` is injected so
 * each failure mode can be produced deterministically.
 */

const enoent = () => Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });

const makeFs = () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  rename: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('data'),
  stat: jest.fn().mockResolvedValue({ isDirectory: () => false }),
});

const withFakeFs = (fs: ReturnType<typeof makeFs>, filePath = '/tmp/run-cache/cache.json') => {
  const adapter = new FilesystemAdapter({ filePath });
  // Bypass the lazy module loading and use the fake fs instead
  Object.assign(adapter as any, { fs, path, modulesPromise: Promise.resolve() });
  return adapter;
};

describe('FilesystemAdapter (unit)', () => {
  describe('config', () => {
    it('applies defaults', () => {
      const adapter = new FilesystemAdapter();
      expect(adapter.autoSaveInterval).toBe(0);
      expect(adapter.autoLoadOnInit).toBe(true);
    });

    it('applies overrides', () => {
      const adapter = new FilesystemAdapter({ autoSaveInterval: 1000, autoLoadOnInit: false });
      expect(adapter.autoSaveInterval).toBe(1000);
      expect(adapter.autoLoadOnInit).toBe(false);
    });

    it('defaults the file path to <cwd>/<storageKey>.json', async () => {
      const adapter = new FilesystemAdapter({ storageKey: 'unit-test-key' });
      await (adapter as any).verifyInitialization();
      expect((adapter as any).filePath).toBe(path.join(process.cwd(), 'unit-test-key.json'));
    });
  });

  describe('module initialization failures', () => {
    afterEach(() => {
      jest.dontMock('fs/promises');
      jest.resetModules();
    });

    it('wraps the error and retries on the next call', async () => {
      let shouldFail = true;
      jest.resetModules();
      jest.doMock('fs/promises', () => {
        if (shouldFail) {
          throw new Error('fs unavailable');
        }
        return jest.requireActual('fs/promises');
      });
      // eslint-disable-next-line global-require
      const { FilesystemAdapter: Isolated } = require('./filesystem-adapter');
      const adapter = new Isolated({ filePath: path.join(process.cwd(), 'never-written.json') });

      await expect(adapter.load()).rejects.toThrow('Failed to initialize FilesystemAdapter: fs unavailable');

      // The failed promise is dropped, so a later call loads the modules again
      shouldFail = false;
      jest.resetModules();
      await expect(adapter.load()).resolves.toBeNull();
    });

    it('reports non-Error load failures as unknown', async () => {
      jest.resetModules();
      jest.doMock('fs/promises', () => {
        // eslint-disable-next-line no-throw-literal
        throw 'not an error';
      });
      // eslint-disable-next-line global-require
      const { FilesystemAdapter: Isolated } = require('./filesystem-adapter');
      const adapter = new Isolated({ filePath: path.join(process.cwd(), 'never-written.json') });

      await expect(adapter.save('x')).rejects.toThrow('Failed to initialize FilesystemAdapter: unknown error');
    });
  });

  describe('save', () => {
    it('writes to a temp file and renames it over the target', async () => {
      const fs = makeFs();
      const adapter = withFakeFs(fs);
      await adapter.save('payload');

      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/run-cache', { recursive: true });
      const tempPath = fs.writeFile.mock.calls[0][0];
      expect(tempPath).toMatch(/^\/tmp\/run-cache\/cache\.json\..*\.tmp$/);
      expect(fs.rename).toHaveBeenCalledWith(tempPath, '/tmp/run-cache/cache.json');
    });

    it('reports directory creation failures', async () => {
      const fs = makeFs();
      fs.mkdir.mockRejectedValue(new Error('EACCES'));
      await expect(withFakeFs(fs).save('x')).rejects.toThrow(
        'Failed to save cache data to filesystem: Failed to create directory: EACCES',
      );
    });

    it('reports non-Error directory creation failures as unknown', async () => {
      const fs = makeFs();
      fs.mkdir.mockRejectedValue('weird');
      await expect(withFakeFs(fs).save('x')).rejects.toThrow(
        'Failed to save cache data to filesystem: Failed to create directory: unknown error',
      );
    });

    it('removes the temp file when the write fails', async () => {
      const fs = makeFs();
      fs.rename.mockRejectedValue(new Error('EXDEV'));
      await expect(withFakeFs(fs).save('x')).rejects.toThrow('Failed to save cache data to filesystem: EXDEV');
      expect(fs.unlink).toHaveBeenCalledWith(fs.writeFile.mock.calls[0][0]);
    });

    it('ignores a failure to remove the temp file', async () => {
      const fs = makeFs();
      fs.writeFile.mockRejectedValue('disk full');
      fs.unlink.mockRejectedValue(enoent());
      await expect(withFakeFs(fs).save('x')).rejects.toThrow('Failed to save cache data to filesystem: unknown error');
    });
  });

  describe('load', () => {
    it('returns the file contents', async () => {
      await expect(withFakeFs(makeFs()).load()).resolves.toBe('data');
    });

    it('returns null when the file does not exist', async () => {
      const fs = makeFs();
      fs.access.mockRejectedValue(enoent());
      await expect(withFakeFs(fs).load()).resolves.toBeNull();
      expect(fs.readFile).not.toHaveBeenCalled();
    });

    it('reports a directory path', async () => {
      const fs = makeFs();
      fs.readFile.mockRejectedValue(new Error('EISDIR: illegal operation on a directory'));
      await expect(withFakeFs(fs).load()).rejects.toThrow('Failed to load cache data from filesystem: Path is a directory');
    });

    it('reports other read errors', async () => {
      const fs = makeFs();
      fs.readFile.mockRejectedValue(new Error('EACCES: permission denied'));
      await expect(withFakeFs(fs).load()).rejects.toThrow(
        'Failed to load cache data from filesystem: EACCES: permission denied',
      );
    });

    it('reports non-Error read failures as unknown', async () => {
      const fs = makeFs();
      fs.readFile.mockRejectedValue('weird');
      await expect(withFakeFs(fs).load()).rejects.toThrow('Failed to load cache data from filesystem: unknown error');
    });
  });

  describe('clear', () => {
    it('deletes the file', async () => {
      const fs = makeFs();
      await withFakeFs(fs).clear();
      expect(fs.unlink).toHaveBeenCalledWith('/tmp/run-cache/cache.json');
    });

    it('does nothing when the file does not exist', async () => {
      const fs = makeFs();
      fs.access.mockRejectedValue(enoent());
      await expect(withFakeFs(fs).clear()).resolves.toBeUndefined();
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('refuses to delete a directory', async () => {
      const fs = makeFs();
      fs.stat.mockResolvedValue({ isDirectory: () => true });
      await expect(withFakeFs(fs).clear()).rejects.toThrow(
        'Failed to clear cache data from filesystem: Path is a directory',
      );
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('wraps unexpected errors', async () => {
      const fs = makeFs();
      fs.unlink.mockRejectedValue(new Error('EPERM: operation not permitted'));
      await expect(withFakeFs(fs).clear()).rejects.toThrow(
        'Failed to clear cache data from filesystem: EPERM: operation not permitted',
      );
    });

    it('swallows non-Error failures during the delete', async () => {
      const fs = makeFs();
      fs.unlink.mockRejectedValue('weird');
      await expect(withFakeFs(fs).clear()).resolves.toBeUndefined();
    });
  });
});
