import {
  INITIAL_DELAY_MS,
  MAX_DELAY_MS
} from '../constants/exponential-backoff-delay.js'

/**
 * Calculates an exponential backoff delay in milliseconds using the given retry depth
 * and a start delay of 500ms, which doubles for each additional depth until a max delay
 * of 8000ms
 * @param {Number} depth - The current retry depth
 * @returns {Object} { hasDelay, delay }
 */
export function calculateExponentialBackoffDelay(depth) {
  const delay = INITIAL_DELAY_MS * 2 ** depth
  const hasDelay = delay <= MAX_DELAY_MS

  return {
    hasDelay,
    delay: hasDelay ? delay : undefined
  }
}
