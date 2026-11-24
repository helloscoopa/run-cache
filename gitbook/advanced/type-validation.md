# Type Safety

RunCache's typing is compile-time only. The generic parameter on `set`, `get` and `createTypedCache` tells TypeScript what you expect to find, but nothing checks the stored value at runtime. This page covers what the types give you and how to add a runtime check where you need one.

## What the types guarantee

```typescript
import { RunCache } from 'run-cache';

interface User {
  id: number;
  name: string;
}

// The value is checked against User when you set it
await RunCache.set<User>({ key: 'user:1', value: { id: 1, name: 'Ada' } });

// get() is typed as User | User[] | undefined:
// an array when the key is a wildcard pattern, undefined on a miss
const user = (await RunCache.get<User>('user:1')) as User | undefined;
```

`createTypedCache<T>()` fixes the type once for a group of keys, so every `set`, `get` and event callback uses `T`. See the [Typed Cache Interface](../api/typed-cache-interface.md).

What the types do **not** guarantee:

- A key set elsewhere with a different type is still returned as `T`.
- Data restored from a storage adapter, or written by an older version of your app, is returned as `T` whatever its shape.
- Values that JSON cannot represent (a `Date`, a `Map`, a class instance) come back in their JSON form, not as `T`. See [Value Serialization](serialization-adapters.md).

RunCache does not export runtime validators, and no cache method accepts a validator option.

## Adding a runtime check

When a value may come from outside your control, check it after reading. A type guard keeps the check and the type together:

```typescript
interface User {
  id: number;
  name: string;
}

function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as User).id === 'number' &&
    typeof (value as User).name === 'string'
  );
}

async function getUser(key: string): Promise<User | undefined> {
  const value = await RunCache.get<unknown>(key);
  if (value === undefined) return undefined;
  if (!isUser(value)) {
    // Drop the bad entry; the next get() returns undefined until you set it again
    await RunCache.delete(key);
    return undefined;
  }
  return value;
}
```

If you already use a schema library such as Zod, Valibot or io-ts, use its parser in place of the hand-written guard. Checking on read is usually enough; checking before `set()` as well catches bad data where it enters.

## Wildcard reads

A key containing `*` returns an array of every matching value, so narrow the result before treating it as a single value:

```typescript
const result = await RunCache.get<User>('user:*');
const users = Array.isArray(result) ? result.filter(isUser) : [];
```

## Next Steps

- [Typed Caching](../getting-started/typed-caching.md) - Using generics with RunCache
- [Typed Cache Interface](../api/typed-cache-interface.md) - API reference for `createTypedCache`
- [Value Serialization](serialization-adapters.md) - Which values round-trip unchanged
