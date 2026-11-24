# Value Serialization

RunCache stores every entry as a string. Strings are stored exactly as given; any other value is converted with `JSON.stringify` when it is set and converted back with `JSON.parse` when it is read. You do not need to serialize values yourself.

```typescript
import { RunCache } from 'run-cache';

await RunCache.set({ key: 'user:1', value: { name: 'Ada', roles: ['admin'] } });

const user = await RunCache.get<{ name: string; roles: string[] }>('user:1');
console.log(user); // { name: 'Ada', roles: ['admin'] }, an object, not a string
```

The same applies to values returned by a `sourceFn`, on the first fetch and on every refetch, and to values restored from a [storage adapter](persistent-storage.md).

## What round-trips

Because the conversion is plain JSON, a value comes back exactly as it went in only if JSON can represent it:

| Value you set | What `get()` returns |
| --- | --- |
| `'hello'`, `''`, `'{"a":1}'` (any string) | The same string. Strings are never parsed, even if they look like JSON |
| `42`, `0`, `true`, `false` | The same number or boolean |
| `null` | `null` |
| Plain objects and arrays of the above | An equal object or array |
| `undefined` inside an object | The property is dropped |
| `NaN`, `Infinity` | `null` |
| `Date` | Its ISO string, e.g. `"2026-01-01T00:00:00.000Z"` |
| `Map`, `Set`, `RegExp` | `{}` (their contents are lost) |
| A class instance | A plain object with its own enumerable properties; methods and prototype are lost |
| `BigInt` | `set()` throws, because JSON cannot represent it |

Setting `value: undefined` is the same as not passing a value, so `set()` then needs a `sourceFn`.

## Storing types JSON cannot represent

RunCache does not have pluggable serializers. Convert such values to a JSON-friendly shape before you set them, and back after you read them:

```typescript
// Date
await RunCache.set({ key: 'last-sync', value: new Date().toISOString() });
const lastSync = new Date((await RunCache.get('last-sync')) as string);

// Map and Set
const permissions = new Map([['read', true], ['write', false]]);
await RunCache.set({ key: 'permissions', value: [...permissions] });
const restored = new Map((await RunCache.get<[string, boolean][]>('permissions')) as [string, boolean][]);

// BigInt
await RunCache.set({ key: 'balance', value: (10n ** 20n).toString() });
const balance = BigInt((await RunCache.get('balance')) as string);
```

A small helper keeps the conversion in one place:

```typescript
interface Session {
  userId: string;
  expiresAt: Date;
}

async function setSession(key: string, session: Session) {
  await RunCache.set({ key, value: { ...session, expiresAt: session.expiresAt.toISOString() } });
}

async function getSession(key: string): Promise<Session | undefined> {
  const raw = (await RunCache.get(key)) as { userId: string; expiresAt: string } | undefined;
  return raw && { ...raw, expiresAt: new Date(raw.expiresAt) };
}
```

## Serialization and middleware

[Middleware](middleware.md) runs on the stored form of a value, so the `value` a middleware receives is always a string (or `undefined`). On `set`, objects have already been converted to JSON; on `get`, the value is parsed after the middleware chain has run. A middleware that transforms strings symmetrically, such as encryption or compression, therefore works for any value type.

## Next Steps

- [Type Safety](type-validation.md) - Typed reads and runtime checks
- [Middleware](middleware.md) - Transform values on their way in and out
- [Persistent Storage](persistent-storage.md) - How serialized entries are saved
