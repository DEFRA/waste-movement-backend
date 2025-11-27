import { createLogger } from '../helpers/logging/logger.js'

const logger = createLogger()

// See https://www.npmjs.com/package/exponential-backoff for all options
export const BACKOFF_OPTIONS = {
  numOfAttempts: 6,
  retry: (error, attemptNumber) => {
    logger.error(
      `Backoff attempt ${attemptNumber} of ${BACKOFF_OPTIONS.numOfAttempts}: ${error.message}`
    )
    return true
  }
}
