# Changelog

All notable changes to RunCache are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

Add an entry under **Unreleased** in the same pull request as the change. When a version is tagged, rename that section to the version and date, add a new empty `## [Unreleased]` section above it, and update the links at the bottom: point `[Unreleased]` at `compare/vX.Y.Z...HEAD` and add a `[X.Y.Z]` link comparing the previous tag with the new one.

## [Unreleased]

## [1.7.0] - 2026-11-24

### Added
- Values of any JSON-serializable type can be cached; strings are stored as-is and other values are serialized on `set()` and parsed again by `get()`. `RunCache.createTypedCache<T>()` returns a typed wrapper ([#39](https://github.com/helloscoopa/run-cache/pull/39), [#67](https://github.com/helloscoopa/run-cache/pull/67)).
- `RunCacheError`, `SourceFnError` and `MiddlewareError` are exported; they keep the original error as `cause`, and `refetch_failure` events carry it as `error` ([#80](https://github.com/helloscoopa/run-cache/pull/80)).
- Storage adapters honour `autoSaveInterval` and `autoLoadOnInit` when attached ([#79](https://github.com/helloscoopa/run-cache/pull/79)).
- `handleProcessSignals` option to shut down (and save) on `SIGINT`/`SIGTERM` or page unload; off by default ([#70](https://github.com/helloscoopa/run-cache/pull/70)).
- `onListenerError` option; event listener errors no longer affect cache operations ([#76](https://github.com/helloscoopa/run-cache/pull/76)).
- Versioned GitBook docs with a version switcher ([#81](https://github.com/helloscoopa/run-cache/pull/81)).
- `CONTRIBUTING.md`, this changelog, and `npm run docs:check`, which checks the code samples in the docs against the exported API in CI ([#56](https://github.com/helloscoopa/run-cache/issues/56)).

### Changed
- Dependents are invalidated automatically when the entry they depend on is updated, refetched, deleted, evicted, invalidated by tag or expires; circular dependencies are rejected ([#78](https://github.com/helloscoopa/run-cache/pull/78)).
- Loading from storage merges into the cache, re-arms TTL timers for the time remaining, and no longer writes source function code or applies the stored configuration ([#79](https://github.com/helloscoopa/run-cache/pull/79)).
- LRU eviction orders by recency and counts writes as a use ([#77](https://github.com/helloscoopa/run-cache/pull/77)).
- Empty strings are valid values ([#80](https://github.com/helloscoopa/run-cache/pull/80)).
- `CacheConfig.defaultTTL` is marked deprecated: it was never applied.

### Fixed
- Storage adapters passed to `configure()` are attached ([#66](https://github.com/helloscoopa/run-cache/pull/66)).
- TTLs longer than the `setTimeout` limit work ([#68](https://github.com/helloscoopa/run-cache/pull/68)).
- Entries changed while a refetch is in flight are not resurrected ([#69](https://github.com/helloscoopa/run-cache/pull/69)).
- The package bundles and runs in browsers ([#71](https://github.com/helloscoopa/run-cache/pull/71)).
- Expired entries are removed when their TTL fires, and timers do not keep Node.js alive ([#73](https://github.com/helloscoopa/run-cache/pull/73)).
- A failed `set()` leaves the existing entry and its timer untouched ([#74](https://github.com/helloscoopa/run-cache/pull/74)).
- `clearEventListeners()` clears only the requested event's listeners ([#75](https://github.com/helloscoopa/run-cache/pull/75)).
- Documentation: removed APIs that do not exist (runtime validators, serialization adapters, `validator`/`metadata` options, `getInternalCache()`), awaited every async call in samples, stopped stringifying values by hand, and removed the duplicated GitBook/Mintlify tooling files ([#56](https://github.com/helloscoopa/run-cache/issues/56)).

## [1.6.1] - 2025-05-26

### Fixed
- Build the minified bundle (`dist/index.min.js`).

## [1.6.0] - 2025-05-13

### Added
- Middleware support with `use()` and `clearMiddleware()` ([#35](https://github.com/helloscoopa/run-cache/pull/35)).
- Tag-based invalidation ([#36](https://github.com/helloscoopa/run-cache/pull/36)).
- Storage adapters for localStorage, IndexedDB and the filesystem ([#37](https://github.com/helloscoopa/run-cache/pull/37)).

### Changed
- Internal refactor for modularity ([#27](https://github.com/helloscoopa/run-cache/pull/27)); linting enabled ([#38](https://github.com/helloscoopa/run-cache/pull/38)).

## [1.5.0] - 2025-05-12

### Added
- Wildcard key patterns ([#23](https://github.com/helloscoopa/run-cache/pull/23)).
- Configurable eviction policies ([#24](https://github.com/helloscoopa/run-cache/pull/24)).
- Graceful shutdown ([#25](https://github.com/helloscoopa/run-cache/pull/25)).
- Logging ([#26](https://github.com/helloscoopa/run-cache/pull/26)).

## [1.4.1] - 2024-09-29

### Fixed
- Use `setInterval` instead of `setTimeout` for auto-refetch ([#18](https://github.com/helloscoopa/run-cache/pull/18)).

## [1.4.0] - 2024-09-19

### Added
- Event listeners `onExpiry`, `onKeyExpiry`, `onRefetch`, `onKeyRefetch` and `clearEventListeners()`, built on an event emitter ([#16](https://github.com/helloscoopa/run-cache/pull/16)).

## [1.3.2] - 2024-09-15

### Added
- Events/triggers ([#9](https://github.com/helloscoopa/run-cache/pull/9)).

### Fixed
- No concurrent `sourceFn` calls between refetches ([#11](https://github.com/helloscoopa/run-cache/pull/11)).

## [1.2.2] - 2024-09-13

### Fixed
- Ship `.d.ts` type declarations ([#5](https://github.com/helloscoopa/run-cache/pull/5)).

## [1.2.0] - 2024-09-13

### Added
- Auto-refetch on expiry ([#4](https://github.com/helloscoopa/run-cache/pull/4)).

### Changed
- `set()` and `setWithSourceFn()` merged into `set()` ([#2](https://github.com/helloscoopa/run-cache/pull/2)).

## [1.0.5] - 2024-09-09

- Initial release.

[Unreleased]: https://github.com/helloscoopa/run-cache/compare/v1.7.0...HEAD
[1.7.0]: https://github.com/helloscoopa/run-cache/compare/v1.6.1...v1.7.0
[1.6.1]: https://github.com/helloscoopa/run-cache/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/helloscoopa/run-cache/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/helloscoopa/run-cache/compare/v1.4.1...v1.5.0
[1.4.1]: https://github.com/helloscoopa/run-cache/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/helloscoopa/run-cache/compare/v1.3.2...v1.4.0
[1.3.2]: https://github.com/helloscoopa/run-cache/compare/v1.2.2...v1.3.2
[1.2.2]: https://github.com/helloscoopa/run-cache/compare/v1.2.0...v1.2.2
[1.2.0]: https://github.com/helloscoopa/run-cache/compare/v1.0.5...v1.2.0
[1.0.5]: https://github.com/helloscoopa/run-cache/releases/tag/v1.0.5
