import { Emitter } from './emitter';

describe('Emitter', () => {
  it('calls listeners in registration order with the emitted arguments', () => {
    const emitter = new Emitter();
    const calls: string[] = [];
    emitter.on('e', (a, b) => calls.push(`first:${a}:${b}`));
    emitter.on('e', (a, b) => calls.push(`second:${a}:${b}`));

    expect(emitter.emit('e', 1, 2)).toBe(true);
    expect(calls).toEqual(['first:1:2', 'second:1:2']);
  });

  it('returns false when an event has no listeners', () => {
    expect(new Emitter().emit('none')).toBe(false);
  });

  it('counts listeners and lists event names', () => {
    const emitter = new Emitter();
    emitter.on('a', () => {});
    emitter.on('a', () => {});
    emitter.on('b', () => {});

    expect(emitter.listenerCount('a')).toBe(2);
    expect(emitter.listenerCount('missing')).toBe(0);
    expect(emitter.eventNames().sort()).toEqual(['a', 'b']);
  });

  it('removes a single listener registration', () => {
    const emitter = new Emitter();
    const listener = jest.fn();
    emitter.on('e', listener);
    emitter.on('e', listener);

    emitter.removeListener('e', listener);
    emitter.emit('e');
    expect(listener).toHaveBeenCalledTimes(1);

    emitter.removeListener('e', listener);
    expect(emitter.eventNames()).toEqual([]);
  });

  it('removes all listeners for one event or for every event', () => {
    const emitter = new Emitter();
    emitter.on('a', () => {});
    emitter.on('b', () => {});

    emitter.removeAllListeners('a');
    expect(emitter.eventNames()).toEqual(['b']);

    emitter.removeAllListeners();
    expect(emitter.eventNames()).toEqual([]);
  });

  it('is not affected by listeners added or removed during an emit', () => {
    const emitter = new Emitter();
    const late = jest.fn();
    const second = jest.fn();
    const first = () => {
      emitter.on('e', late);
      emitter.removeListener('e', second);
    };
    emitter.on('e', first);
    emitter.on('e', second);

    emitter.emit('e');
    expect(second).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();

    emitter.emit('e');
    expect(late).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('supports many listeners without warnings', () => {
    const emitter = new Emitter();
    const warn = jest.spyOn(console, 'warn');
    for (let i = 0; i < 100; i++) emitter.on('e', () => {});
    expect(emitter.listenerCount('e')).toBe(100);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
