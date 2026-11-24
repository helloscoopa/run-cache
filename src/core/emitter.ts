/**
 * Listener signature used by {@link Emitter}
 */
export type Listener = (...args: any[]) => void;

/**
 * Minimal, dependency-free event emitter.
 *
 * Replaces Node's `EventEmitter` so the library runs unchanged in browsers and other
 * non-Node runtimes. It implements only the subset RunCache uses, with the same
 * semantics: listeners run synchronously in registration order, and the listener list
 * is snapshotted before each emit so adding or removing listeners while emitting does
 * not affect the current dispatch.
 *
 * @internal
 */
export class Emitter {
  private listeners = new Map<string, Listener[]>();

  /**
   * Adds a listener for `event`.
   */
  on(event: string, listener: Listener): this {
    const existing = this.listeners.get(event);
    if (existing) {
      existing.push(listener);
    } else {
      this.listeners.set(event, [listener]);
    }
    return this;
  }

  /**
   * Removes the most recently added registration of `listener` for `event`.
   */
  removeListener(event: string, listener: Listener): this {
    const existing = this.listeners.get(event);
    if (!existing) {
      return this;
    }
    const index = existing.lastIndexOf(listener);
    if (index !== -1) {
      existing.splice(index, 1);
    }
    if (!existing.length) {
      this.listeners.delete(event);
    }
    return this;
  }

  /**
   * Removes all listeners for `event`, or for every event when called without arguments.
   */
  removeAllListeners(event?: string): this {
    if (event === undefined) {
      this.listeners.clear();
    } else {
      this.listeners.delete(event);
    }
    return this;
  }

  /**
   * Calls every listener registered for `event` with `args`.
   *
   * @returns true if the event had listeners
   */
  emit(event: string, ...args: unknown[]): boolean {
    const existing = this.listeners.get(event);
    if (!existing || !existing.length) {
      return false;
    }
    for (const listener of [...existing]) {
      listener(...args);
    }
    return true;
  }

  /**
   * Returns the number of listeners registered for `event`.
   */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  /**
   * Returns the names of events that currently have listeners.
   */
  eventNames(): string[] {
    return Array.from(this.listeners.keys());
  }
}
