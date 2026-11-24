/**
 * @jest-environment node
 */
import * as path from 'path';
import * as vm from 'vm';
import { build } from 'esbuild';

const entry = path.join(__dirname, 'index.ts');

/**
 * Bundles the library the way a browser bundler (or the CDN build) would.
 * Node built-ins are not available on the browser platform, so any static
 * import of one shows up as an external import or a build error.
 */
async function bundleFor(platform: 'browser' | 'neutral', format: 'esm' | 'iife') {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    platform,
    format,
    globalName: format === 'iife' ? 'RunCacheLib' : undefined,
    target: 'es2020',
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  const [output] = Object.values(result.metafile!.outputs);
  return { code: result.outputFiles[0].text, imports: output.imports };
}

describe('browser compatibility', () => {
  it.each(['browser', 'neutral'] as const)('bundles for the %s platform without importing Node built-ins', async (platform) => {
    const { code, imports } = await bundleFor(platform, 'esm');

    expect(imports).toEqual([]);
    expect(code).not.toMatch(/from\s*["']node:/);
    expect(code).not.toMatch(/\brequire\(["']/);
  });

  it('runs in a browser-like global scope without Node globals', async () => {
    const { code } = await bundleFor('browser', 'iife');
    const store: Record<string, string> = {};
    const sandbox: Record<string, unknown> = {
      console: { log() {}, error() {}, debug() {}, warn() {}, info() {} },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
      },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);

    const lib = sandbox.RunCacheLib as typeof import('./index');
    expect(typeof lib.RunCache.set).toBe('function');

    const onExpiry = jest.fn();
    await lib.RunCache.onExpiry(onExpiry);
    await lib.RunCache.set({ key: 'k', value: 'v', ttl: 10 });
    expect(await lib.RunCache.get('k')).toBe('v');
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    expect(onExpiry).toHaveBeenCalledTimes(1);

    await lib.RunCache.configure({ storageAdapter: new lib.LocalStorageAdapter({ storageKey: 'test' }) });
    await lib.RunCache.shutdown();
  });
});
