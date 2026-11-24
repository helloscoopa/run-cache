import {
  DefaultSerializationAdapter,
  SerializationAdapter,
  SerializationManager,
} from './serialization';

class DateAdapter implements SerializationAdapter<Date> {
  serialize(value: Date): string {
    return `DATE:${value.toISOString()}`;
  }

  deserialize(serialized: string): Date {
    return new Date(serialized.slice(5));
  }

  canHandle(value: any): boolean {
    return value instanceof Date;
  }
}

describe('DefaultSerializationAdapter', () => {
  const adapter = new DefaultSerializationAdapter();

  it('passes strings through unchanged', () => {
    expect(adapter.serialize('hello')).toBe('hello');
    expect(adapter.serialize('')).toBe('');
  });

  it('JSON-stringifies non-string values', () => {
    expect(adapter.serialize(42)).toBe('42');
    expect(adapter.serialize(true)).toBe('true');
    expect(adapter.serialize(null)).toBe('null');
    expect(adapter.serialize({ a: 1, b: [1, 2] })).toBe('{"a":1,"b":[1,2]}');
  });

  it('parses JSON when deserializing', () => {
    expect(adapter.deserialize('42')).toBe(42);
    expect(adapter.deserialize('{"a":1}')).toEqual({ a: 1 });
    expect(adapter.deserialize('[1,2]')).toEqual([1, 2]);
  });

  it('falls back to the raw string when JSON parsing fails', () => {
    expect(adapter.deserialize('not json')).toBe('not json');
    expect(adapter.deserialize('{broken')).toBe('{broken');
  });

  it('can handle any value', () => {
    expect(adapter.canHandle(undefined)).toBe(true);
    expect(adapter.canHandle('x')).toBe(true);
    expect(adapter.canHandle({})).toBe(true);
  });
});

describe('SerializationManager', () => {
  let manager: SerializationManager;

  beforeEach(() => {
    manager = new SerializationManager();
  });

  it('uses the default adapter when no custom adapters are registered', () => {
    expect(manager.serialize({ x: 1 })).toBe('{"x":1}');
    expect(manager.deserialize('{"x":1}')).toEqual({ x: 1 });
    expect(manager.getAdapters()).toEqual([]);
  });

  it('uses a matching custom adapter for serialization', () => {
    manager.addAdapter(new DateAdapter());
    const date = new Date('2024-01-02T03:04:05.000Z');

    expect(manager.serialize(date)).toBe('DATE:2024-01-02T03:04:05.000Z');
    // Values the adapter cannot handle fall back to the default adapter
    expect(manager.serialize([1])).toBe('[1]');
  });

  it('uses the hint to pick an adapter when deserializing', () => {
    manager.addAdapter(new DateAdapter());
    const result = manager.deserialize<Date>('DATE:2024-01-02T03:04:05.000Z', new Date());

    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2024-01-02T03:04:05.000Z');
  });

  it('falls back to the default adapter without a hint or a matching hint', () => {
    manager.addAdapter(new DateAdapter());

    expect(manager.deserialize('{"a":1}')).toEqual({ a: 1 });
    expect(manager.deserialize('{"a":1}', { not: 'a date' })).toEqual({ a: 1 });
  });

  it('gives priority to the most recently added adapter', () => {
    const first: SerializationAdapter = {
      serialize: () => 'first',
      deserialize: () => 'first',
      canHandle: () => true,
    };
    const second: SerializationAdapter = {
      serialize: () => 'second',
      deserialize: () => 'second',
      canHandle: () => true,
    };
    manager.addAdapter(first);
    manager.addAdapter(second);

    expect(manager.serialize('anything')).toBe('second');
    expect(manager.deserialize('anything', 'hint')).toBe('second');
    expect(manager.getAdapters()).toEqual([second, first]);
  });

  it('returns a copy of the adapters list', () => {
    manager.addAdapter(new DateAdapter());
    const adapters = manager.getAdapters();
    adapters.pop();

    expect(manager.getAdapters()).toHaveLength(1);
  });

  it('clears custom adapters', () => {
    manager.addAdapter(new DateAdapter());
    manager.clearAdapters();

    expect(manager.getAdapters()).toEqual([]);
    expect(manager.serialize(new Date('2024-01-02T03:04:05.000Z'))).toBe('"2024-01-02T03:04:05.000Z"');
  });
});
