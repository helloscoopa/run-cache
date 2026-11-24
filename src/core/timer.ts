import type { ExpiryTimer } from '../types/timer';

/**
 * Largest delay accepted by `setTimeout` in Node.js and browsers (2^31 - 1 ms, about 24.8 days).
 * Longer delays are clamped to 1 ms by the runtime, so they must be split up.
 */
export const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export type { ExpiryTimer };

/**
 * Calls `unref()` on a timeout handle when the runtime supports it (Node.js).
 */
function unrefHandle(handle: unknown): void {
  if (handle && typeof handle === 'object' && typeof (handle as { unref?: unknown }).unref === 'function') {
    (handle as { unref: () => void }).unref();
  }
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
  let unrefed = false;

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
    if (unrefed) {
      unrefHandle(handle);
    }
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
    unref() {
      unrefed = true;
      unrefHandle(handle);
    },
  };
}
