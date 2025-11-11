import { expect } from '@jest/globals'
import { INITIAL_DELAY_MS } from '../constants/exponential-backoff-delay.js'
import { calculateExponentialBackoffDelay } from './exponential-backoff-delay.js'

describe('#calculateExponentialBackOffDelay', () => {
  it.each([
    {
      depth: 0,
      delay: INITIAL_DELAY_MS
    },
    {
      depth: 1,
      delay: INITIAL_DELAY_MS * 2
    },
    {
      depth: 2,
      delay: INITIAL_DELAY_MS * 4
    },
    {
      depth: 3,
      delay: INITIAL_DELAY_MS * 8
    },
    {
      depth: 4,
      delay: INITIAL_DELAY_MS * 16
    }
  ])(
    'should return hasDelay = "true" and delay = "$delay" when depth = "$depth"',
    async (testData) => {
      const { hasDelay, delay } = calculateExponentialBackoffDelay(
        testData.depth
      )

      expect(hasDelay).toBeTruthy()
      expect(delay).toEqual(testData.delay)
    }
  )

  it('should return hasDelay = "false" and delay = "undefined" when calculated delay is greater than MAX_DELAY_MS', async () => {
    const { hasDelay, delay } = calculateExponentialBackoffDelay(6)

    expect(hasDelay).toBeFalsy()
    expect(delay).toBeUndefined()
  })
})
