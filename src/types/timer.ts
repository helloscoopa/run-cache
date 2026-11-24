/**
 * A cancellable one-shot timer that supports delays longer than `setTimeout` allows.
 * Created by `createExpiryTimer` in `src/core/timer.ts`.
 */
export interface ExpiryTimer {
  /** Cancels the timer. Safe to call more than once. */
  clear(): void;

  /**
   * Lets a Node.js process exit while this timer is pending. Applies to the current
   * underlying timeout and to every timeout armed later for a long delay.
   * No-op in environments whose timer handles have no `unref` (browsers).
   */
  unref(): void;
}
