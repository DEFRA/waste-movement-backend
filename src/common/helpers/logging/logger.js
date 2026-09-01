import { pino } from 'pino'

import { loggerOptions } from './logger-options.js'

const logger = pino(loggerOptions)

function createLogger(seed = {}) {
  return Object.keys(seed).length > 0 ? logger.child(seed) : logger
}

export { createLogger }
