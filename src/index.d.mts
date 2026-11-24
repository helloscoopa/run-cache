/**
 * Type declarations for the ES module build (`dist/index.mjs`).
 *
 * The CommonJS declarations (`index.d.ts`) describe `module.exports`, which TypeScript
 * would otherwise use as the default import for ESM consumers under `node16`/`nodenext`
 * resolution. In the ESM build the default export is the `RunCache` class itself.
 */
import { RunCache } from './run-cache.js';

export * from './index.js';
export default RunCache;
