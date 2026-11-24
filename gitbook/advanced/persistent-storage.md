# Persistent Storage

RunCache keeps entries in memory, so they are lost when a Node.js process restarts or a browser page reloads. A storage adapter lets you save the cache to a durable medium and load it back later.

## Storage Adapters

Three adapters are built in:

| Adapter | Environment | Where data goes |
| --- | --- | --- |
| `FilesystemAdapter` | Node.js | A JSON file, `./<storageKey>.json` by default |
| `LocalStorageAdapter` | Browser | `window.localStorage`, under `storageKey` |
| `IndexedDBAdapter` | Browser | The `cache-store` object store of the `run-cache-db` database, under `storageKey` |

Each adapter throws from its constructor when used in the wrong environment.

### Options

All three accept these options. `FilesystemAdapter` also accepts `filePath`, which overrides the file location.

| Option | Default | Effect |
| --- | --- | --- |
| `storageKey` | `"run-cache-data"` | Key (or file name) the data is stored under |
| `autoSaveInterval` | `0` (off) | Save every this many milliseconds while the adapter is attached |
| `autoLoadOnInit` | `true` | Load the saved data when the adapter is attached |

```typescript
import { FilesystemAdapter, LocalStorageAdapter, IndexedDBAdapter } from 'run-cache';

new FilesystemAdapter({ storageKey: 'my-app-cache' });            // ./my-app-cache.json
new FilesystemAdapter({ filePath: '/var/cache/my-app/cache.json' });
new LocalStorageAdapter({ storageKey: 'my-app-cache', autoSaveInterval: 60000 });
new IndexedDBAdapter({ storageKey: 'my-app-cache', autoLoadOnInit: false });
```

## Attaching an Adapter

```typescript
import { RunCache, FilesystemAdapter } from 'run-cache';

await RunCache.configure({
  storageAdapter: new FilesystemAdapter({ storageKey: 'my-app-cache' })
});

// Entries saved by a previous run are available now
const user = await RunCache.get('user:1');
```

Configuring an adapter immediately loads the data it holds (unless it was created with `autoLoadOnInit: false`) and merges it into the cache, as described in [Restoring Data](#restoring-data). `configure()` returns a promise, so `await` it before reading from the cache. Configuring the adapter that is already attached does nothing.

When you switch to a different adapter, RunCache first saves the current entries to the previous adapter and then loads from the new one. If saving to the previous adapter fails, `configure()` rejects and the previous adapter stays attached, so no entries are lost and you can retry. Loading never changes your configuration: the `maxEntries` and `evictionPolicy` stored with the data are ignored. Pass `storageAdapter: undefined` to detach persistence.

## Saving

Nothing is saved unless you ask for it, in one of these ways.

### Manually

```typescript
const saved = await RunCache.saveToStorage();   // false if the adapter failed or none is attached
const loaded = await RunCache.loadFromStorage(); // false if nothing was saved or the data could not be read
```

Neither method throws on adapter errors: failures are reported as `false`, and logged when `debug: true` is set (see [Debugging](../guides/debugging.md)). Loading merges into the cache; to return to exactly the saved state, call `RunCache.flush()` first.

### Auto-save

Either give the adapter an `autoSaveInterval`, which applies while that adapter is attached, or start an interval yourself:

```typescript
// Save every 5 minutes
await RunCache.setupAutoSave(300000);

// Stop auto-saving
await RunCache.setupAutoSave(0);
```

Call `setupAutoSave()` after attaching the adapter: it does nothing while no adapter is attached. An interval started with `setupAutoSave()` keeps running when you switch adapters; one requested by an adapter's `autoSaveInterval` ends when that adapter is detached. In Node.js the timer does not keep the process alive.

### On shutdown

`RunCache.shutdown()` saves to the attached adapter, then clears all entries, timers and listeners and detaches the adapter. To have that happen on `SIGINT`/`SIGTERM` (Node.js) or page unload (browser), opt in when configuring:

```typescript
await RunCache.configure({
  storageAdapter: new FilesystemAdapter({ storageKey: 'my-app-cache' }),
  handleProcessSignals: true
});
```

Without `handleProcessSignals`, call `await RunCache.shutdown()` from your own shutdown code. In a browser, an IndexedDB save started during page unload may not finish; save at a quieter moment as well if the data matters.

## Restoring Data

When data is loaded, whether automatically on attaching an adapter or with `loadFromStorage()`:

- **Stored entries are merged into the cache.** Keys that already exist in memory keep their current value; the stored copy is ignored. Nothing in memory is cleared. To return to exactly the saved state, call `RunCache.flush()` before `RunCache.loadFromStorage()`.
- **Expired entries are skipped.** Entries that had already expired when the cache was saved are not written at all.
- **TTLs continue where they left off.** Each restored entry expires after the time remaining on its original TTL, not a fresh TTL, and emits its `expire` event as usual.
- **Your configuration wins.** `maxEntries`, `evictionPolicy` and other options are whatever you configured, not what was stored. If the restored entries exceed `maxEntries`, the eviction policy is applied.
- **Source functions must be set again.** Functions are never written to storage, so restored entries hold their last value but cannot be refetched or auto-refetched until you call `set()` with a `sourceFn` for them.

Values keep their type (see [Value Serialization](serialization-adapters.md)), and tags, dependencies, `autoRefetch` flags and access statistics are restored too.

```typescript
await RunCache.configure({ storageAdapter: new FilesystemAdapter() });

// Re-register source functions for entries that need refetching
await RunCache.set({
  key: 'exchange-rates',
  sourceFn: fetchExchangeRates,
  ttl: 60000,
  autoRefetch: true
});
```

## Storage Format

Every adapter stores the same JSON string:

```json
{
  "version": 1,
  "timestamp": 1735689600000,
  "entries": {
    "user:1": {
      "value": "{\"name\":\"Ada\"}",
      "serialized": true,
      "createdAt": 1735689500000,
      "updatedAt": 1735689500000,
      "ttl": 3600000,
      "accessCount": 3,
      "lastAccessed": 1735689590000,
      "tags": ["user"],
      "dependencies": ["session:1"]
    }
  },
  "config": { "maxEntries": 1000, "evictionPolicy": "LRU" }
}
```

`serialized: true` marks a value that was set as a non-string and is parsed again when read. Source functions are never written. The `config` block is informational only and is not applied when the data is loaded.

The FilesystemAdapter writes to a temporary file in the same directory and renames it over the target, so a crash during a save never leaves a truncated cache file behind.

## Custom Storage Adapters

Implement the `StorageAdapter` interface to store the cache anywhere:

```typescript
interface StorageAdapter {
  save(data: string): Promise<void>;
  load(): Promise<string | null>; // null when nothing has been saved
  clear(): Promise<void>;

  // Optional: read when the adapter is attached with configure()
  readonly autoSaveInterval?: number; // save at this interval (ms) when > 0
  readonly autoLoadOnInit?: boolean;  // load existing data on attach (default: true)
}
```

### Example: Redis

```typescript
import { RunCache, type StorageAdapter } from 'run-cache';
import Redis from 'ioredis';

class RedisStorageAdapter implements StorageAdapter {
  private redis: Redis;
  private key: string;

  constructor(options: { redisUrl: string; key?: string }) {
    this.redis = new Redis(options.redisUrl);
    this.key = options.key ?? 'run-cache-data';
  }

  async save(data: string): Promise<void> {
    await this.redis.set(this.key, data);
  }

  async load(): Promise<string | null> {
    return this.redis.get(this.key);
  }

  async clear(): Promise<void> {
    await this.redis.del(this.key);
  }
}

await RunCache.configure({
  storageAdapter: new RedisStorageAdapter({ redisUrl: 'redis://localhost:6379', key: 'my-app-cache' })
});
```

### Wrapping an adapter

Middleware does not run when the cache is saved or loaded. To transform the stored data, for example to encrypt or compress it, wrap another adapter:

```typescript
import { type StorageAdapter, LocalStorageAdapter } from 'run-cache';

class TransformingAdapter implements StorageAdapter {
  constructor(
    private inner: StorageAdapter,
    private encode: (data: string) => string | Promise<string>,
    private decode: (data: string) => string | Promise<string>
  ) {}

  async save(data: string): Promise<void> {
    await this.inner.save(await this.encode(data));
  }

  async load(): Promise<string | null> {
    const data = await this.inner.load();
    return data === null ? null : this.decode(data);
  }

  clear(): Promise<void> {
    return this.inner.clear();
  }

  // Pass the wrapped adapter's options through
  get autoSaveInterval() { return this.inner.autoSaveInterval; }
  get autoLoadOnInit() { return this.inner.autoLoadOnInit; }
}

// encryptString/decryptString are your own functions
await RunCache.configure({
  storageAdapter: new TransformingAdapter(new LocalStorageAdapter(), encryptString, decryptString)
});
```

The same wrapper can drop entries you do not want persisted: parse the JSON in `encode`, delete keys from `entries`, and stringify it again.

## Best Practices

1. **Pick the adapter for the environment.** `FilesystemAdapter` for Node.js; `IndexedDBAdapter` for larger browser caches, since `localStorage` is usually limited to about 5 MB per origin and its writes block the main thread.
2. **Save explicitly.** Combine `autoSaveInterval` (or `setupAutoSave()`) with `handleProcessSignals: true` or your own `await RunCache.shutdown()`.
3. **Check the result of `saveToStorage()`.** It returns `false` instead of throwing, for example when `localStorage` is full. Turn on `debug` to see the reason.
4. **Separate data by `storageKey`.** Use one key per user, environment or data-format version; changing the key is the simplest way to discard data written by an older version of your app. Because loading merges, `flush()` before attaching a different user's adapter.
5. **Re-register source functions after loading** for entries that rely on `refetch()` or `autoRefetch`.

## Common Scenarios

### Browser application with per-user data

```typescript
import { RunCache, LocalStorageAdapter } from 'run-cache';

async function onUserLogin(userId: string) {
  // Save the previous user's entries to their key and detach their adapter
  await RunCache.configure({ storageAdapter: undefined });
  // Loading merges, so clear memory before loading another user's data
  await RunCache.flush();

  await RunCache.configure({
    storageAdapter: new LocalStorageAdapter({
      storageKey: `user-${userId}-cache`,
      autoSaveInterval: 60000
    })
  });

  const profile = await RunCache.get('user:profile');
  if (profile === undefined) {
    await RunCache.set({ key: 'user:profile', value: await fetchUserProfile(userId), ttl: 3600000 });
  }
}
```

### Node.js service

```typescript
import { RunCache, FilesystemAdapter, EvictionPolicy } from 'run-cache';

await RunCache.configure({
  maxEntries: 10000,
  evictionPolicy: EvictionPolicy.LRU,
  storageAdapter: new FilesystemAdapter({
    filePath: './data/cache.json',
    autoSaveInterval: 5 * 60 * 1000
  }),
  handleProcessSignals: true // save on SIGINT/SIGTERM
});
```

### Choosing an adapter by environment

```typescript
import { RunCache, FilesystemAdapter, IndexedDBAdapter, type StorageAdapter } from 'run-cache';

const isNode = typeof process !== 'undefined' && !!process.versions?.node;
const storageAdapter: StorageAdapter = isNode
  ? new FilesystemAdapter({ storageKey: 'app-cache' })
  : new IndexedDBAdapter({ storageKey: 'app-cache' });

await RunCache.configure({ storageAdapter });
```

## Next Steps

- [Storage Adapters API](../api/storage-adapters.md) - Adapter reference
- [Resource Management](resource-management.md) - Shutdown and cleanup
- [Value Serialization](serialization-adapters.md) - How values are stored
