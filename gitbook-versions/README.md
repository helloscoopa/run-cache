# Versioned docs

Readers of the RunCache GitBook site can switch between documentation versions from the version menu above the sidebar. Each version is its own GitBook space, declared in [`gitbook-docs.yaml`](../gitbook-docs.yaml) at the repository root.

| Version | Directory | Source |
| --- | --- | --- |
| Latest release (default) | `gitbook-versions/vX.Y/` (highest) | Frozen at the newest release tag |
| Older releases | `gitbook-versions/vX.Y/` | Frozen at the last tag of each minor line |
| Next (unreleased) | `gitbook/` | Live docs on `main` |

Releases before v1.6.0 had no `gitbook/` folder, so their version is that tag's README as a single page.

## Day to day

Edit `gitbook/` as before. Those changes appear under **Next (unreleased)** and do not touch any released version.

## Releasing

Pushing a tag like `v1.7.0` runs the **Docs version** workflow, which freezes `gitbook/` at that tag into `gitbook-versions/v1.7/` and opens a PR. Merge it and GitBook adds v1.7 to the menu as the new default. A patch tag (`v1.7.1`) refreshes `v1.7/` in place.

To do the same by hand:

```bash
node scripts/docs-version.mjs snapshot v1.7.0
```

To fix a typo in an old version, edit its files in `gitbook-versions/` directly. If you add or remove a directory by hand, run `node scripts/docs-version.mjs config` to rewrite `gitbook-docs.yaml`.

## Rules

- `gitbook-docs.yaml` is generated. Do not edit it by hand.
- Never change a space `key` (`space-v1-6`, `space-next`, ...). GitBook matches spaces by key, and a new key creates a new, empty space.
- Files in `gitbook-versions/` are not linted or built. They are Markdown read by GitBook only.
