# Installation

RunCache can be easily installed using npm, yarn, or pnpm. The library has no external dependencies, making it lightweight and simple to integrate into your projects.

## Using npm

```bash
npm install run-cache
```

## Using yarn

```bash
yarn add run-cache
```

## Using pnpm

```bash
pnpm add run-cache
```

## Module Formats

The package provides both CommonJS and ES module builds, selected automatically through the `exports` field in `package.json`:

| How you load it | File used |
| --- | --- |
| `import { RunCache } from 'run-cache'` (Node.js ESM, bundlers) | `dist/index.mjs` |
| `require('run-cache')` | `dist/index.js` |
| `<script type="module">` from a CDN | `dist/index.min.js` |

TypeScript declarations are provided for both: `dist/index.d.mts` for `import` (with `moduleResolution` set to `node16`, `nodenext` or `bundler`) and `dist/index.d.ts` for `require`.

Deep imports such as `run-cache/dist/storage` or `run-cache/dist/run-cache` continue to work, with or without the `.js` extension.

The CommonJS and ES module builds are separate copies of the library. If one application loads RunCache through both `import` and `require`, it gets two independent caches, so use one style throughout.

## Browser Usage

RunCache works in both Node.js and browser environments, with no Node.js built-ins required in the browser. For browser usage, you can either:

1. Use a bundler like webpack, Vite, Rollup, Parcel or esbuild. No polyfills or extra configuration are needed.
2. Import from a CDN like unpkg or jsDelivr.

`FilesystemAdapter` is exported from the same entry point, but it loads Node.js's `fs` and `path` modules only when it is used, so browser bundles do not try to include them.

### CDN Usage Example

```html
<script type="module">
  import { RunCache, LocalStorageAdapter } from 'https://unpkg.com/run-cache@{version}/dist/index.min.js';

  // Now you can use RunCache in your code
  await RunCache.set({ key: 'example', value: 'Hello, world!' });

  // The browser storage adapters are included in the CDN build
  await RunCache.configure({ storageAdapter: new LocalStorageAdapter() });
</script>
```

## TypeScript Support

RunCache includes TypeScript definitions, so no additional packages are required for TypeScript projects. The library is written in TypeScript, ensuring type safety and excellent IDE integration.

```typescript
// TypeScript example
import { RunCache, EvictionPolicy } from 'run-cache';

// Configure with proper type checking
RunCache.configure({
  maxEntries: 100,
  evictionPolicy: EvictionPolicy.LRU
});
```

## Verifying Installation

To verify that RunCache is installed correctly, you can create a simple test file:

```typescript
import { RunCache } from 'run-cache';

async function testRunCache() {
  await RunCache.set({ key: 'test', value: 'It works!' });
  const value = await RunCache.get('test');
  console.log(value); // Should output: It works!
}

testRunCache();
```

## Next Steps

Once you have RunCache installed, check out the [Basic Usage](basic-usage.md) guide to learn how to use the basic features of the library. 