import { EventEmitter } from 'node:events';
import {
  EventFn, EventName, EventParam, EmitParam, EVENT,
} from '../types/events';
import { Logger } from '../logging/logger';
import { matchesPattern } from './utils';

/**
 * EventSystem class to handle cache events.
 *
 * This class provides a pub/sub mechanism for the cache system, allowing applications
 * to register callbacks for various cache events (expiry, refetch, refetch failure).
 * It supports both global events and key-specific events with wildcard pattern matching.
 *
 * @internal
 */
export class EventSystem {
  /** Node.js EventEmitter used for the event distribution */
  private emitter: EventEmitter;

  /** Storage for wildcard pattern listeners that need special handling */
  private wildcardListeners: Array<{
    event: EventName;
    keyPattern: string;
    fn: EventFn;
  }>;

  /** Logger instance for event-related logging */
  private logger: Logger;

  /**
   * Creates a new EventSystem instance.
   *
   * @param {Logger} logger - Logger instance for event-related logging
   */
  constructor(logger: Logger) {
    this.logger = logger;
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(0); // unlimited – safe for library code
    this.wildcardListeners = [];
  }

  /**
   * Normalizes event names to handle both enum values and string literals.
   * Converts uppercase event names (like 'EXPIRE') to lowercase enum values (like 'expire').
   *
   * @param {EventName} event - The event name to normalize
   * @returns {string} The normalized event name
   * @private
   */
  private normalizeEventName(event: EventName): string {
    // If event is an uppercase string like 'EXPIRE', convert it to lowercase
    if (typeof event === 'string' && event === event.toUpperCase()) {
      const lowercaseEvent = event.toLowerCase();
      // Check if there's a matching enum value in the EVENT values
      const eventValues = Object.values(EVENT) as string[];
      if (eventValues.includes(lowercaseEvent)) {
        return lowercaseEvent;
      }
    }
    return event;
  }

  /**
   * Emits an event to registered listeners.
   * This will trigger both global event listeners and key-specific listeners.
   *
   * @param {EventName} event - The event type to emit
   * @param {EmitParam} cache - The cache entry data to include with the event
   */
  emitEvent(event: EventName, cache: EmitParam): void {
    const eventParam: EventParam = {
      key: cache.key,
      value: cache.value,
      ttl: cache.ttl,
      createdAt: cache.createdAt,
      updatedAt: cache.updatedAt,
      tag: cache.tag,
      dependencyKey: cache.dependencyKey,
    };

    this.logger.log('debug', `Emitting ${event} event for key: ${cache.key}`);

    // Normalize the event name to handle both enum values and string literals
    const normalizedEvent = this.normalizeEventName(event);

    // Emit for the global event type (this includes wildcard listeners)
    const globalListenerCount = this.emitter.listenerCount(normalizedEvent);
    this.emitter.emit(normalizedEvent, eventParam);
    this.logger.log('debug', `Emitted ${normalizedEvent} to ${globalListenerCount} global listeners`);

    // Emit for the key-specific event
    const keyEvent = `${normalizedEvent}-${cache.key}`;
    const keyListenerCount = this.emitter.listenerCount(keyEvent);
    this.emitter.emit(keyEvent, eventParam);
    this.logger.log('debug', `Emitted ${keyEvent} to ${keyListenerCount} key-specific listeners`);
  }

  /**
   * Registers a callback for global expire events.
   * The callback will be triggered whenever any cache entry expires.
   *
   * @param {EventFn} callback - The function to call when any entry expires
   */
  onExpiry(callback: EventFn): void {
    this.logger.log('debug', 'Registering global expiry listener');
    const normalizedEvent = this.normalizeEventName(EVENT.EXPIRE);
    this.emitter.on(normalizedEvent, callback);
  }

  /**
   * Registers a callback for key-specific expire events.
   * Supports wildcard patterns in the key for matching multiple entries.
   *
   * @param {string} key - The key or pattern for which to listen for expiry events
   * @param {EventFn} callback - The function to call when matching entries expire
   * @throws {Error} If the key is empty
   */
  onKeyExpiry(key: string, callback: EventFn): void {
    if (!key) throw Error('Empty key');
    this.logger.log('debug', `Registering key-specific expiry listener for: ${key}`);
    this.addKeyListener(EVENT.EXPIRE, key, callback);
  }

  /**
   * Registers a callback for global refetch events.
   * The callback will be triggered whenever any cache entry is refetched.
   *
   * @param {EventFn} callback - The function to call when any entry is refetched
   */
  onRefetch(callback: EventFn): void {
    this.logger.log('debug', 'Registering global refetch listener');
    const normalizedEvent = this.normalizeEventName(EVENT.REFETCH);
    this.emitter.on(normalizedEvent, callback);
  }

  /**
   * Registers a callback for key-specific refetch events.
   * Supports wildcard patterns in the key for matching multiple entries.
   *
   * @param {string} key - The key or pattern for which to listen for refetch events
   * @param {EventFn} callback - The function to call when matching entries are refetched
   * @throws {Error} If the key is empty
   */
  onKeyRefetch(key: string, callback: EventFn): void {
    if (!key) throw Error('Empty key');
    this.logger.log('debug', `Registering key-specific refetch listener for: ${key}`);
    this.addKeyListener(EVENT.REFETCH, key, callback);
  }

  /**
   * Registers a callback for global refetch failure events.
   * The callback will be triggered whenever any refetch operation fails.
   *
   * @param {EventFn} callback - The function to call when any refetch operation fails
   */
  onRefetchFailure(callback: EventFn): void {
    this.logger.log('debug', 'Registering global refetch failure listener');
    const normalizedEvent = this.normalizeEventName(EVENT.REFETCH_FAILURE);
    this.emitter.on(normalizedEvent, callback);
  }

  /**
   * Registers a callback for key-specific refetch failure events.
   * Supports wildcard patterns in the key for matching multiple entries.
   *
   * @param {string} key - The key or pattern for which to listen for refetch failure events
   * @param {EventFn} callback - The function to call when matching refetch operations fail
   * @throws {Error} If the key is empty
   */
  onKeyRefetchFailure(key: string, callback: EventFn): void {
    if (!key) throw Error('Empty key');
    this.logger.log('debug', `Registering key-specific refetch failure listener for: ${key}`);
    this.addKeyListener(EVENT.REFETCH_FAILURE, key, callback);
  }

  /**
   * Registers a callback for global tag invalidation events.
   * The callback will be triggered whenever cache entries are invalidated by a tag.
   *
   * @param {EventFn} callback - The function to call when tag invalidation occurs
   */
  onTagInvalidation(callback: EventFn): void {
    this.logger.log('debug', 'Registering global tag invalidation listener');
    const normalizedEvent = this.normalizeEventName(EVENT.TAG_INVALIDATION);
    this.emitter.on(normalizedEvent, callback);
  }

  /**
   * Registers a callback for key-specific tag invalidation events.
   * Supports wildcard patterns in the key for matching multiple entries.
   *
   * @param {string} key - The key or pattern for which to listen for tag invalidation events
   * @param {EventFn} callback - The function to call when matching entries are invalidated by tag
   * @throws {Error} If the key is empty
   */
  onKeyTagInvalidation(key: string, callback: EventFn): void {
    if (!key) throw Error('Empty key');
    this.logger.log('debug', `Registering key-specific tag invalidation listener for: ${key}`);
    this.addKeyListener(EVENT.TAG_INVALIDATION, key, callback);
  }

  /**
   * Registers a callback for global dependency invalidation events.
   * The callback will be triggered whenever cache entries are invalidated due to a dependency.
   *
   * @param {EventFn} callback - The function to call when dependency invalidation occurs
   */
  onDependencyInvalidation(callback: EventFn): void {
    this.logger.log('debug', 'Registering global dependency invalidation listener');
    const normalizedEvent = this.normalizeEventName(EVENT.DEPENDENCY_INVALIDATION);
    this.emitter.on(normalizedEvent, callback);
  }

  /**
   * Registers a callback for key-specific dependency invalidation events.
   * Supports wildcard patterns in the key for matching multiple entries.
   *
   * @param {string} key - The key or pattern for which to listen for dependency invalidation events
   * @param {EventFn} callback - The function to call when matching entries are invalidated by dependency
   * @throws {Error} If the key is empty
   */
  onKeyDependencyInvalidation(key: string, callback: EventFn): void {
    if (!key) throw Error('Empty key');
    this.logger.log('debug', `Registering key-specific dependency invalidation listener for: ${key}`);
    this.addKeyListener(EVENT.DEPENDENCY_INVALIDATION, key, callback);
  }

  /**
   * Clears event listeners based on the specified parameters.
   * Provides flexible options for removing listeners at different levels of granularity.
   *
   * @param {Object} [params] - Optional parameters to specify which listeners to clear
   * @param {EventName} [params.event] - The event type for which to clear listeners
   * @param {string} [params.key] - The key pattern for which to clear listeners. When given without
   *   `event`, listeners for that key (or pattern) are cleared for every event type. An exact key
   *   only clears listeners registered for that exact key, not wildcard listeners that match it.
   * @returns {boolean} true if at least one listener was removed, false otherwise
   */
  clearEventListeners(params?: {
    event?: EventName;
    key?: string;
  }): boolean {
    if (!params) {
      const total = this.emitter.eventNames()
        .reduce((count, eventName) => count + this.emitter.listenerCount(eventName), 0);
      this.logger.log('info', `Clearing all event listeners (${total})`);
      this.emitter.removeAllListeners();
      this.wildcardListeners = [];
      return total > 0;
    }

    // An options object that selects nothing (`{}`, `{ event: undefined }`) is a no-op,
    // so a filter built from optional values never clears every listener by accident
    if (params.event === undefined && params.key === undefined) {
      return false;
    }

    if (params.key && !params.event) {
      let removedAny = false;
      for (const event of Object.values(EVENT)) {
        removedAny = this.clearKeyEventListeners(event, params.key) || removedAny;
      }
      return removedAny;
    }

    if (params.event && params.key) {
      const normalizedEvent = this.normalizeEventName(params.event);
      return this.clearKeyEventListeners(normalizedEvent, params.key);
    }

    if (params.event) {
      const normalizedEvent = this.normalizeEventName(params.event);
      return this.clearEventTypeListeners(normalizedEvent);
    }

    return false;
  }

  /**
   * Helper method to add a key-specific listener with wildcard support.
   * Handles the complexity of registering pattern-based listeners.
   *
   * @param {EventName} event - The event type to listen for
   * @param {string} key - The key or pattern to match
   * @param {EventFn} callback - The function to call when matching events occur
   * @private
   */
  private addKeyListener(event: EventName, key: string, callback: EventFn): void {
    const normalizedEvent = this.normalizeEventName(event);

    if (key.includes('*')) {
      this.logger.log('debug', `Adding wildcard listener for event: ${normalizedEvent}, pattern: ${key}`);
      // For wildcard patterns, create a wrapper function that filters events
      const wrapper: EventFn = (params: EventParam) => {
        if (matchesPattern(key, params.key)) {
          this.logger.log('debug', `Wildcard match: pattern ${key} matched key ${params.key}`);
          callback(params);
        }
      };

      // Attach the wrapper to the root event
      this.emitter.on(normalizedEvent, wrapper);

      // Store the reference for later cleanup
      this.wildcardListeners.push({
        event: normalizedEvent as EventName,
        keyPattern: key,
        fn: wrapper,
      });
    } else {
      this.logger.log('debug', `Adding exact key listener for event: ${normalizedEvent}, key: ${key}`);
      this.emitter.on(`${normalizedEvent}-${key}`, callback);
    }
  }

  /**
   * Clears all listeners for a specific event and key combination.
   * Handles both exact key matches and wildcard pattern matches.
   *
   * @param {string} event - The normalized event type for which to clear listeners
   * @param {string} key - The key or pattern for which to clear listeners
   * @returns {boolean} true if listeners were removed, false otherwise
   * @private
   */
  private clearKeyEventListeners(event: string, key: string): boolean {
    this.logger.log('debug', `Clearing listeners for event: ${event}, key: ${key}`);

    if (key.includes('*')) {
      let removedCount = 0;
      // 1) Remove namespaced listeners
      const prefix = `${event}-`;
      for (const eventName of this.emitter.eventNames()) {
        if (typeof eventName === 'string' && eventName.startsWith(prefix)) {
          const eventKey = eventName.slice(prefix.length);
          if (matchesPattern(key, eventKey)) {
            const count = this.emitter.listenerCount(eventName);
            this.emitter.removeAllListeners(eventName);
            removedCount += count;
            this.logger.log('debug', `Removed ${count} listeners for ${eventName}`);
          }
        }
      }

      // 2) Remove wildcard wrappers
      const remaining: typeof this.wildcardListeners = [];
      let wildcardRemoved = 0;
      for (const entry of this.wildcardListeners) {
        if (
          entry.event === event
          && matchesPattern(key, entry.keyPattern)
        ) {
          this.emitter.removeListener(entry.event, entry.fn);
          wildcardRemoved++;
        } else {
          remaining.push(entry);
        }
      }
      this.wildcardListeners = remaining;
      this.logger.log('debug', `Removed ${wildcardRemoved} wildcard listeners`);
      const totalMessage = `Cleared ${removedCount + wildcardRemoved} total listeners for event: ${event}, `
        + `key pattern: ${key}`;
      this.logger.log('info', totalMessage);
      return removedCount + wildcardRemoved > 0;
    }

    const count = this.emitter.listenerCount(`${event}-${key}`);
    this.emitter.removeAllListeners(`${event}-${key}`);
    this.logger.log('info', `Cleared ${count} listeners for event: ${event}, exact key: ${key}`);
    return count > 0;
  }

  /**
   * Clears all listeners for a specific event type
   *
   * @param {string} event - The normalized event type for which to clear listeners
   * @returns {boolean} true if listeners were removed, false otherwise
   * @private
   */
  private clearEventTypeListeners(event: string): boolean {
    // Root listeners include the wrappers registered for wildcard key patterns
    const rootCount = this.emitter.listenerCount(event);
    this.logger.log('debug', `Clearing ${rootCount} root listeners for event: ${event}`);
    this.emitter.removeAllListeners(event);

    // Remove key-specific listeners, which are registered as `${event}-${key}`.
    // Matching on the full prefix (including the separator) matters: event names can
    // share a prefix, e.g. 'refetch' and 'refetch_failure'.
    const prefix = `${event}-`;
    let namespacedCount = 0;
    this.emitter.eventNames().forEach((eventName) => {
      if (typeof eventName === 'string' && eventName.startsWith(prefix)) {
        namespacedCount += this.emitter.listenerCount(eventName);
        this.emitter.removeAllListeners(eventName);
      }
    });
    this.logger.log('debug', `Cleared ${namespacedCount} namespaced listeners for event: ${event}`);

    // Forget the wildcard wrappers for this event; they were removed with the root listeners
    this.wildcardListeners = this.wildcardListeners.filter((entry) => entry.event !== event);

    const total = rootCount + namespacedCount;
    this.logger.log('info', `Cleared all listeners (${total} total) for event: ${event}`);
    return total > 0;
  }
}
