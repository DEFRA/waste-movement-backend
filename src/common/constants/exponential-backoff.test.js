import { BACKOFF_OPTIONS } from './exponential-backoff.js'
import * as logger from '../helpers/logging/logger.js'

describe('BACKOFF_OPTIONS tests', () => {
  describe('#retry', () => {
    it('should log an error message and return true', () => {
      const errorLoggerSpy = jest.spyOn(logger.createLogger(), 'error')

      const result = BACKOFF_OPTIONS.retry(new Error('Database Error'), 1)

      expect(errorLoggerSpy).toHaveBeenCalledWith(
        'Backoff attempt 1 of 6: Database Error'
      )
      expect(result).toBeTruthy()
    })
  })
})
