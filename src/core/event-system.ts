import { EventEmitter } from 'node:events';
import { EventFn, EventName, EventParam, EmitParam, EVENT } from '../types/events';
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

  /**
   * Creates a new EventSystem instance.
   * 
   * @param {Logger} logger - Logger instance for event-related logging
   */
  constructor(private readonly logger: Logger) {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(0); // unlimited – safe for library code
    this.wildcardListeners = [];
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
    };

    this.logger.log('debug', `Emitting ${event} event for key: ${cache.key}`);

    // Emit for the global event type (this includes wildcard listeners)
    const globalListenerCount = this.emitter.listenerCount(event);
    this.emitter.emit(event, eventParam);
    this.logger.log('debug', `Emitted ${event} to ${globalListenerCount} global listeners`);

    // Emit for the key-specific event
    const keyEvent = `${event}-${cache.key}`;
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
    this.logger.log('debug', `Registering global expiry listener`);
    this.emitter.on(EVENT.EXPIRE, callback);
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
    if (!key) throw Error("Empty key");
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
    this.logger.log('debug', `Registering global refetch listener`);
    this.emitter.on(EVENT.REFETCH, callback);
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
    if (!key) throw Error("Empty key");
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
    this.logger.log('debug', `Registering global refetch failure listener`);
    this.emitter.on(EVENT.REFETCH_FAILURE, callback);
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
    if (!key) throw Error("Empty key");
    this.logger.log('debug', `Registering key-specific refetch failure listener for: ${key}`);
    this.addKeyListener(EVENT.REFETCH_FAILURE, key, callback);
  }

  /**
   * Clears event listeners based on the specified parameters.
   * Provides flexible options for removing listeners at different levels of granularity.
   * 
   * @param {Object} [params] - Optional parameters to specify which listeners to clear
   * @param {EventName} [params.event] - The event type for which to clear listeners
   * @param {string} [params.key] - The key pattern for which to clear listeners
   * @returns {boolean} true if listeners were removed, false if no action was taken
   * @throws {Error} If key is provided without an event
   */
  clearEventListeners(params?: {
    event?: EventName;
    key?: string;
  }): boolean {
    if (!params) {
      this.logger.log('info', `Clearing all event listeners`);
      this.emitter.removeAllListeners();
      this.wildcardListeners = [];
      return true;
    }

    if (params.key && !params.event) {
      throw Error("`key` cannot be provided without `event`");
    }

    if (params.event && params.key) {
      return this.clearKeyEventListeners(params.event, params.key);
    }

    if (params.event) {
      return this.clearEventTypeListeners(params.event);
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
    if (key.includes("*")) {
      this.logger.log('debug', `Adding wildcard listener for event: ${event}, pattern: ${key}`);
      // For wildcard patterns, create a wrapper function that filters events
      const wrapper: EventFn = (params: EventParam) => {
        if (matchesPattern(key, params.key)) {
          this.logger.log('debug', `Wildcard match: pattern ${key} matched key ${params.key}`);
          callback(params);
        }
      };
      
      // Attach the wrapper to the root event
      this.emitter.on(event, wrapper);
      
      // Store the reference for later cleanup
      this.wildcardListeners.push({
        event: event,
        keyPattern: key,
        fn: wrapper,
      });
    } else {
      this.logger.log('debug', `Adding exact key listener for event: ${event}, key: ${key}`);
      this.emitter.on(`${event}-${key}`, callback);
    }
  }

  /**
   * Clears all listeners for a specific event and key combination.
   * Handles both exact key matches and wildcard pattern matches.
   * 
   * @param {EventName} event - The event type for which to clear listeners
   * @param {string} key - The key or pattern for which to clear listeners
   * @returns {boolean} true if listeners were removed, false otherwise
   * @private
   */
  private clearKeyEventListeners(event: EventName, key: string): boolean {
    this.logger.log('debug', `Clearing listeners for event: ${event}, key: ${key}`);
    
    if (key.includes("*")) {
      let removedCount = 0;
      // 1) Remove namespaced listeners
      const prefix = `${event}-`;
      for (const eventName of this.emitter.eventNames()) {
        if (typeof eventName === "string" && eventName.startsWith(prefix)) {
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
          entry.event === event &&
          matchesPattern(key, entry.keyPattern)
        ) {
          this.emitter.removeListener(entry.event, entry.fn);
          wildcardRemoved++;
        } else {
          remaining.push(entry);
        }
      }
      this.wildcardListeners = remaining;
      this.logger.log('debug', `Removed ${wildcardRemoved} wildcard listeners`);
      this.logger.log('info', `Cleared ${removedCount + wildcardRemoved} total listeners for event: ${event}, key pattern: ${key}`);
    } else {
      const count = this.emitter.listenerCount(`${event}-${key}`);
      this.emitter.removeAllListeners(`${event}-${key}`);
      this.logger.log('info', `Cleared ${count} listeners for event: ${event}, exact key: ${key}`);
    }
    return true;
  }

  /**
   * Clears all listeners for a specific event type
   */
  private clearEventTypeListeners(event: EventName): boolean {
    const rootCount = this.emitter.listenerCount(event);
    this.logger.log('debug', `Clearing ${rootCount} root listeners for event: ${event}`);
    this.emitter.removeAllListeners(event);

    // Remove all namespaced events
    let namespacedCount = 0;
    this.emitter.eventNames().forEach((eventName) => {
      if (
        typeof eventName === "string" &&
        eventName.startsWith(event)
      ) {
        const count = this.emitter.listenerCount(eventName);
        namespacedCount += count;
        this.emitter.removeAllListeners(eventName);
      }
    });
    this.logger.log('debug', `Cleared ${namespacedCount} namespaced listeners for event: ${event}`);
    
    // Remove all wildcard listeners for this event
    const remaining: typeof this.wildcardListeners = [];
    let wildcardCount = 0;
    for (const entry of this.wildcardListeners) {
      if (entry.event === event) {
        // Already removed by removeAllListeners(event) above
        wildcardCount++;
      } else {
        remaining.push(entry);
      }
    }
    this.wildcardListeners = remaining;
    this.logger.log('debug', `Removed ${wildcardCount} wildcard listener references for event: ${event}`);

    this.logger.log('info', `Cleared all listeners (${rootCount + namespacedCount + wildcardCount} total) for event: ${event}`);
    return true;
  }
} 