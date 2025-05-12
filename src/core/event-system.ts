import { EventEmitter } from 'node:events';
import { EventFn, EventName, EventParam, EmitParam, EVENT } from '../types/events';
import { Logger } from '../logging/logger';
import { CacheUtils } from './utils';

/**
 * EventSystem class to handle cache events
 */
export class EventSystem {
  private emitter: EventEmitter;
  private wildcardListeners: Array<{
    event: EventName;
    keyPattern: string;
    fn: EventFn;
  }>;
  private logger: Logger;

  constructor(logger: Logger) {
    this.emitter = new EventEmitter();
    this.wildcardListeners = [];
    this.logger = logger;
  }

  /**
   * Emits an event to registered listeners
   */
  emitEvent(event: EventName, cache: EmitParam): void {
    const eventParam: EventParam = {
      key: cache.key,
      value: cache.value,
      ttl: cache.ttl,
      createdAt: cache.createdAt,
      updatedAt: cache.updatedAt,
    };

    // Emit both global and key-specific events
    [event, `${event}-${cache.key}`].forEach((eventId) => {
      this.emitter.emit(eventId, eventParam);
    });
  }

  /**
   * Registers a callback for global expire events
   */
  onExpiry(callback: EventFn): void {
    this.emitter.on(EVENT.EXPIRE, callback);
  }

  /**
   * Registers a callback for key-specific expire events
   * Supports wildcard patterns in the key
   */
  onKeyExpiry(key: string, callback: EventFn): void {
    if (!key) throw Error("Empty key");
    this.addKeyListener(EVENT.EXPIRE, key, callback);
  }

  /**
   * Registers a callback for global refetch events
   */
  onRefetch(callback: EventFn): void {
    this.emitter.on(EVENT.REFETCH, callback);
  }

  /**
   * Registers a callback for key-specific refetch events
   * Supports wildcard patterns in the key
   */
  onKeyRefetch(key: string, callback: EventFn): void {
    if (!key) throw Error("Empty key");
    this.addKeyListener(EVENT.REFETCH, key, callback);
  }

  /**
   * Registers a callback for global refetch failure events
   */
  onRefetchFailure(callback: EventFn): void {
    this.emitter.on(EVENT.REFETCH_FAILURE, callback);
  }

  /**
   * Registers a callback for key-specific refetch failure events
   * Supports wildcard patterns in the key
   */
  onKeyRefetchFailure(key: string, callback: EventFn): void {
    if (!key) throw Error("Empty key");
    this.addKeyListener(EVENT.REFETCH_FAILURE, key, callback);
  }

  /**
   * Clears event listeners based on the specified parameters
   */
  clearEventListeners(params?: {
    event?: EventName;
    key?: string;
  }): boolean {
    if (!params) {
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
   * Helper method to add a key-specific listener with wildcard support
   */
  private addKeyListener(event: EventName, key: string, callback: EventFn): void {
    if (key.includes("*")) {
      // For wildcard patterns, create a wrapper function that filters events
      const wrapper: EventFn = (params: EventParam) => {
        if (CacheUtils.matchesPattern(key, params.key)) {
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
      this.emitter.on(`${event}-${key}`, callback);
    }
  }

  /**
   * Clears all listeners for a specific event and key combination
   */
  private clearKeyEventListeners(event: EventName, key: string): boolean {
    if (key.includes("*")) {
      // 1) Remove namespaced listeners
      const prefix = `${event}-`;
      for (const eventName of this.emitter.eventNames()) {
        if (typeof eventName === "string" && eventName.startsWith(prefix)) {
          const eventKey = eventName.slice(prefix.length);
          if (CacheUtils.matchesPattern(key, eventKey)) {
            this.emitter.removeAllListeners(eventName);
          }
        }
      }
      
      // 2) Remove wildcard wrappers
      const remaining: typeof this.wildcardListeners = [];
      for (const entry of this.wildcardListeners) {
        if (
          entry.event === event &&
          CacheUtils.matchesPattern(key, entry.keyPattern)
        ) {
          this.emitter.removeListener(entry.event, entry.fn);
        } else {
          remaining.push(entry);
        }
      }
      this.wildcardListeners = remaining;
    } else {
      this.emitter.removeAllListeners(`${event}-${key}`);
    }
    return true;
  }

  /**
   * Clears all listeners for a specific event type
   */
  private clearEventTypeListeners(event: EventName): boolean {
    this.emitter.removeAllListeners(event);

    // Remove all namespaced events
    this.emitter.eventNames().forEach((eventName) => {
      if (
        typeof eventName === "string" &&
        eventName.startsWith(event)
      ) {
        this.emitter.removeAllListeners(eventName);
      }
    });
    
    // Remove all wildcard listeners for this event
    const remaining: typeof this.wildcardListeners = [];
    for (const entry of this.wildcardListeners) {
      if (entry.event === event) {
        // Already removed by removeAllListeners(event) above
      } else {
        remaining.push(entry);
      }
    }
    this.wildcardListeners = remaining;

    return true;
  }
} 