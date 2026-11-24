# Contributing to RunCache

Thanks for helping improve RunCache. This guide covers setting up the project, the checks a pull request must pass, and how to keep the documentation accurate.

## Setup

You need Node.js 18 or later (CI runs on Node 18) and npm.

```bash
git clone https://github.com/YOUR-USERNAME/run-cache.git
cd run-cache
npm install
git checkout -b fix/short-description
```

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Run the Jest test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with a coverage report |
| `npm run lint` / `npm run lint:fix` | Check (or fix) `src/` with ESLint |
| `npm run build` | Compile with `tsc`, then build the ESM and minified bundles with esbuild |
| `npm run docs:check` | Check the code samples in the docs against the exported API |

After `npm run build`, you can run the JavaScript example with `node examples/middleware-example.js`.

## Making a change

1. **Open an issue first** for features or behaviour changes, so the approach can be agreed before you write code. Small fixes can go straight to a pull request.
2. **Keep zero dependencies.** RunCache has no runtime dependencies; do not add one.
3. **Add tests.** New behaviour needs tests, and a bug fix needs a test that fails without the fix. Keep coverage above 90%.
4. **Update the docs** in the same pull request (see below).
5. **Add a changelog entry** under `Unreleased` in [CHANGELOG.md](CHANGELOG.md).
6. **Use [Conventional Commits](https://www.conventionalcommits.org/)** for commit messages and PR titles, for example `fix: keep TTL timers when set() fails` or `docs: correct storage adapter options`.

Before opening the pull request, make sure `npm test`, `npm run lint`, `npm run build` and `npm run docs:check` all pass. CI runs them on every pull request.

## Documentation

The docs are published on GitBook from this repository. [CLAUDE.md](CLAUDE.md#documentation--versioning) and [gitbook-versions/README.md](gitbook-versions/README.md) describe the layout in full; the short version:

- `gitbook/` holds the docs for the next release. Edit pages there, and list any new page in `gitbook/SUMMARY.md`.
- `gitbook-versions/vX.Y/` holds frozen docs for released versions. Only fix errors there; never add unreleased features.
- `README.md` is the npm landing page; keep its examples in step with `gitbook/`.

When writing code samples:

- Import only what `src/index.ts` exports, and call only methods that exist on `RunCache`.
- `await` every async `RunCache` call (all of them except `createTypedCache()`), or explicitly return or chain the promise.
- Pass objects directly as `value`; RunCache serializes non-string values itself, and `get()` returns them parsed.

`npm run docs:check` enforces these rules on `README.md`, `CLAUDE.md`, `gitbook/` and `examples/`. If a sample deliberately breaks a rule, for example to show the legacy string-based pattern, put `<!-- docs-check-ignore -->` on the line above its code fence.

## Reporting a bug

Include the RunCache version, your runtime (Node.js version or browser), a minimal code sample that reproduces the problem, and what you expected to happen instead.

## Releases

Maintainers release by bumping the version in `package.json`, moving the `Unreleased` changelog entries under the new version, and pushing a `vX.Y.Z` tag. The tag triggers the **Docs version** workflow, which freezes `gitbook/` into `gitbook-versions/vX.Y/`.
