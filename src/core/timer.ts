/**
 * Largest delay accepted by `setTimeout` in Node.js and browsers (2^31 - 1 ms, about 24.8 days).
 * Longer delays are clamped to 1 ms by the runtime, so they must be split up.
 */
export const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * A cancellable one-shot timer that supports delays longer than {@link MAX_TIMEOUT_MS}.
 */
export interface ExpiryTimer {
  /** Cancels the timer. Safe to call more than once. */
  clear(): void;
}

/**
 * Runs `callback` once after `delayMs`. Delays above {@link MAX_TIMEOUT_MS} are
 * covered by re-arming the underlying timer until the target time is reached.
 *
 * @param callback - Function to run when the delay has elapsed
 * @param delayMs - Delay in milliseconds
 * @returns A handle that cancels the timer
 */
export function createExpiryTimer(callback: () => void, delayMs: number): ExpiryTimer {
  const target = Date.now() + delayMs;
  let handle: ReturnType<typeof setTimeout> | undefined;
  let cleared = false;

  const arm = (delay: number): void => {
    handle = setTimeout(() => {
      if (cleared) return;
      const remaining = target - Date.now();
      if (remaining > 0 && delay === MAX_TIMEOUT_MS) {
        // Only a chunked wait can end early; a final chunk always fires the callback
        arm(Math.min(remaining, MAX_TIMEOUT_MS));
        return;
      }
      callback();
    }, delay);
  };

  arm(Math.min(Math.max(delayMs, 0), MAX_TIMEOUT_MS));

  return {
    clear() {
      cleared = true;
      if (handle !== undefined) {
        clearTimeout(handle);
        handle = undefined;
      }
    },
  };
}
