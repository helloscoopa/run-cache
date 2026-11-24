# CLAUDE.md - RunCache Project Guide

## Project Overview
**RunCache** is a dependency-free, lightweight runtime caching library for JavaScript and TypeScript applications. It provides in-memory caching with TTL support, automatic value regeneration, and advanced features like tag-based invalidation, dependency tracking, and persistent storage.

## Key Features
- Zero dependencies
- In-memory performance with TTL support
- Source function support for automatic refetching
- Event system for cache lifecycle monitoring
- Pattern matching with wildcards
- Multiple eviction policies (LRU, LFU)
- Middleware support for custom processing
- Tag-based and dependency-based invalidation
- Persistent storage adapters (localStorage, IndexedDB, filesystem)
- TypeScript support with full type definitions

## Project Structure

### Main Files
- `src/run-cache.ts` - Main RunCache class with static methods
- `src/index.ts` - Entry point and exports
- `src/core/cache-store.ts` - Core cache implementation
- `src/types/` - TypeScript type definitions
- `src/storage/` - Storage adapter implementations
- `src/logging/` - Logger implementation
- `src/policies/` - Eviction policy implementations

### Build & Testing
- **Build**: `npm run build` (TypeScript compilation + minification)
- **Test**: `npm test` (Jest)
- **Lint**: `npm run lint` (ESLint with TypeScript)
- **Coverage**: `npm run test:coverage`

### Development Commands
```bash
# Install dependencies
npm install

# Run tests
npm test
npm run test:watch    # Watch mode
npm run test:coverage # With coverage

# Build
npm run build         # Full build
npm run build:min     # Minified build only

# Linting
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues

# Docs
npm run docs:check    # Check doc code samples against the exported API
```

## Architecture

### Core Components
1. **RunCache Class** (`src/run-cache.ts`): Static wrapper providing public API
2. **CacheStore** (`src/core/cache-store.ts`): Core cache implementation
3. **Event System** (`src/core/event-system.ts`): Event handling and subscriptions
4. **Middleware Manager** (`src/core/middleware-manager.ts`): Middleware pipeline
5. **Storage Adapters** (`src/storage/`): Persistence layer implementations

### Key Patterns
- **Singleton Pattern**: RunCache uses a single static instance
- **Event-Driven**: Comprehensive event system for monitoring
- **Middleware Pattern**: Pluggable transformation pipeline
- **Strategy Pattern**: Multiple eviction policies and storage adapters

## API Reference

### Basic Operations
```typescript
// Set cache entry
await RunCache.set({ 
  key: "user:123", 
  value: "John Doe", 
  ttl: 60000,  // 1 minute
  tags: ["user", "profile"],
  dependencies: ["user:session"]
});

// Get cache entry
const user = await RunCache.get("user:123");

// Delete entry
await RunCache.delete("user:123");

// Check existence
const exists = await RunCache.has("user:*");

// Refetch (requires sourceFn)
await RunCache.refetch("user:123");
```

### Advanced Features
```typescript
// Auto-refetch configuration
await RunCache.set({
  key: "api-data",
  sourceFn: async () => await fetchApiData(),
  ttl: 300000,
  autoRefetch: true
});

// Tag-based invalidation
await RunCache.invalidateByTag("user");

// Dependency-based invalidation
await RunCache.invalidateByDependency("user:session");

// Middleware
await RunCache.use(async (value, context, next) => {
  console.log(`${context.operation} on ${context.key}`);
  return next(value);
});
```

### Configuration
```typescript
import { EvictionPolicy, LocalStorageAdapter } from 'run-cache';

await RunCache.configure({
  maxEntries: 1000,
  evictionPolicy: EvictionPolicy.LRU,
  debug: true,
  storageAdapter: new LocalStorageAdapter()
});
```

### Event Handling
```typescript
// Global events
await RunCache.onExpiry((event) => console.log(`Expired: ${event.key}`));
await RunCache.onRefetch((event) => console.log(`Refetched: ${event.key}`));
await RunCache.onRefetchFailure((event) => console.error(`Failed: ${event.key}`));

// Key-specific events (supports wildcards)
await RunCache.onKeyExpiry("user:*", (event) => {
  console.log(`User cache expired: ${event.key}`);
});
```

## Common Development Tasks

### Adding New Features
1. Update type definitions in `src/types/`
2. Implement core logic in `src/core/cache-store.ts`
3. Add static wrapper methods in `src/run-cache.ts`
4. Add comprehensive tests in `.test.ts` files
5. Update documentation in `gitbook/` (see [Documentation & Versioning](#documentation--versioning)) and add an entry under `Unreleased` in `CHANGELOG.md`

### Testing Strategy
- Unit tests for each component (`.unit.test.ts`)
- Integration tests for main functionality (`.test.ts`)
- Coverage target: Keep above 90%
- Test files use Jest with TypeScript support

### Storage Adapters
Located in `src/storage/`:
- `local-storage-adapter.ts` - Browser localStorage
- `indexed-db-adapter.ts` - Browser IndexedDB  
- `filesystem-adapter.ts` - Node.js filesystem

Creating new adapters:
1. Implement `StorageAdapter` interface
2. Add to `src/storage/index.ts`
3. Create comprehensive tests
4. Update documentation in `gitbook/`

## Documentation & Versioning

The docs are published on GitBook with a version menu above the sidebar, so readers see the docs for the RunCache version they install, not whatever is on `main`. Each version is its own GitBook space, synced from this repo with GitBook's site-wide Git Sync (project directory = repo root).

### Layout
| Path | What it is | Edit it? |
| --- | --- | --- |
| `gitbook/` | **Next (unreleased)**: the live docs for `main` | Yes, all new docs go here |
| `gitbook-versions/vX.Y/` | Frozen docs of the last tag of each minor line (v1.6 from v1.6.1, ...) | Only to fix errors in that release's docs |
| `gitbook-versions/README.md` | Maintainer notes on versioning | When the process changes |
| `gitbook-docs.yaml` | GitBook site config: one space per version | **Never by hand**, it is generated |
| `scripts/docs-version.mjs` | Freezes a tag's docs and regenerates `gitbook-docs.yaml` | When the process changes |
| `.github/workflows/docs-version.yml` | Runs the script on release tags and opens a PR | When the process changes |

- The highest `gitbook-versions/vX.Y` is the **default** version (title "vX.Y (latest)"), matching npm `latest`. "Next" is never the default while a release exists.
- Releases before v1.6.0 had no `gitbook/` folder; their version is that tag's `README.md` as a single page.
- Each space directory has `.gitbook.yaml`, `README.md` and `SUMMARY.md`. New pages must be added to that space's `SUMMARY.md`.

### Writing docs for a change
1. Edit or add pages in `gitbook/` only, and list new pages in `gitbook/SUMMARY.md`.
2. Do not copy unreleased features into `gitbook-versions/`: released docs describe what shipped.
3. A bug fix that also applies to a released line may be documented in that `gitbook-versions/vX.Y/` too, if the fix is released there.
4. Use relative `.md` links that stay inside the same space directory; never link from one version directory into another.

### Releasing a version
- Pushing a tag `vX.Y.Z` runs the **Docs version** workflow: it freezes `gitbook/` at that tag into `gitbook-versions/vX.Y/`, regenerates `gitbook-docs.yaml`, and opens a PR (`docs/version-vX.Y.Z`). Merging it makes vX.Y the new default.
- A patch tag (`vX.Y.Z+1`) replaces `gitbook-versions/vX.Y/` in place; there is one version per minor line.
- Manual equivalent: `node scripts/docs-version.mjs snapshot vX.Y.Z`. The workflow can also be run by hand (workflow_dispatch) with a `tag` input.
- The snapshot drops legacy tooling files that older tags still contain (`book.json`, `mint.json`, `setup-gitbook.sh`, `README_GITBOOK.md`, `README_MAIN.md`, `DOCUMENTATION_SUMMARY.md`, `styles/`; GitBook Git Sync is the only docs toolchain, so `gitbook/` no longer has them), strips live shields.io badges, and adds a version hint under the README's first heading.
- Running the snapshot rewrites the whole version directory, so hand fixes made in `gitbook-versions/vX.Y/` are lost if that line is snapshotted again. Fix them in `gitbook/` before tagging, or re-apply after.

### `gitbook-docs.yaml` rules
- Regenerate with `node scripts/docs-version.mjs config` after adding or removing a directory in `gitbook-versions/`.
- Never change a space `key` (`space-v1-6`, `space-next`, ...). GitBook matches spaces by key; a new key creates a new empty space and detaches the old one. Rename with `title`, change URLs with `path`.
- Exactly one space has `default: true`, and every `key` is unique. The file must validate against `https://api.gitbook.com/gitbook-docs.yaml`.
- Version URL paths use hyphens (`v1-6`, `next`).

### Checks before committing doc changes
- `npm run docs:check` passes. It reads the fenced js/ts blocks in `README.md`, `CLAUDE.md` and `gitbook/`, plus `examples/`, and flags imports the package does not export, `RunCache` methods that do not exist, async calls without `await`, and known-stale patterns. Put `<!-- docs-check-ignore -->` above a block that breaks a rule on purpose.
- `node scripts/docs-version.mjs config` leaves no diff (`git status` is clean for `gitbook-docs.yaml`).
- Every relative `.md` link in the changed space resolves to a file in that space.
- No new pages are missing from the space's `SUMMARY.md`.

### One-time setup (outside the repo)
- GitBook: site-wide Git Sync on this repo, project directory empty (repo root).
- GitHub: Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests", so the release workflow can open its PR.

## Debugging

### Debug Mode
```typescript
await RunCache.configure({ debug: true });
```

### Common Issues
- **Initialization errors**: Check storage adapter configuration
- **Event listener leaks**: Use `clearEventListeners()` in cleanup
- **Memory issues**: Configure appropriate `maxEntries` and eviction policy
- **TTL not working**: Ensure TTL is in milliseconds, not seconds

### Logging
The logger (`src/logging/logger.ts`) supports multiple levels:
- `info`: General operations
- `debug`: Detailed debugging info
- `warn`: Potential issues
- `error`: Errors and failures

## Repository Information
- **GitHub**: https://github.com/helloscoopa/run-cache
- **NPM**: https://www.npmjs.com/package/run-cache
- **License**: MIT
- **Current Version**: 1.6.1

## Best Practices
1. Use appropriate TTL values to balance performance and freshness
2. Leverage tags and dependencies for efficient invalidation
3. Configure eviction policies for memory management
4. Use events for monitoring and debugging
5. Test storage adapters thoroughly in target environments
6. Always handle async operations with proper error handling

## Future Development Notes
- Consider adding more eviction policies (FIFO, Random)
- Explore distributed caching capabilities
- Add metrics and monitoring features
- Consider compression for large values
- Add batch operations for improved performance