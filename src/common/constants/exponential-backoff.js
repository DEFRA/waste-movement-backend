import { createLogger } from '../helpers/logging/logger.js'

const logger = createLogger()

// See https://www.npmjs.com/package/exponential-backoff for all options
export const BACKOFF_OPTIONS = {
  numOfAttempts: 8,
  retry: (error, attemptNumber) => {
    logger.error(`Backoff attempt ${attemptNumber}: ${error.message}`)
    return true
  }
}
