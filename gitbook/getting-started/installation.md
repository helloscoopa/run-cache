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

## Browser Usage

RunCache works in both Node.js and browser environments. For browser usage, you can either:

1. Use a bundler like webpack, Rollup, or Parcel
2. Import from a CDN like unpkg or jsDelivr

### CDN Usage Example

```html
<script type="module">
  import { RunCache } from 'https://unpkg.com/run-cache@{version}/dist/index.min.js';
  
  // Now you can use RunCache in your code
  RunCache.set({ key: 'example', value: 'Hello, world!' });
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