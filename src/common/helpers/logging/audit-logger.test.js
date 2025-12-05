import { auditLogger } from './audit-logger.js'
import * as cdpAuditing from '@defra/cdp-auditing'
import * as logger from '../logging/logger.js'
import { AUDIT_LOGGER_TYPE } from '../../constants/audit-logger.js'

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest
    .fn()
    .mockImplementationOnce(() => true)
    .mockImplementationOnce(() => true)
    .mockImplementation(() => {
      throw new Error('Internal Server Error')
    })
}))

describe('Audit Logger Tests', () => {
  describe('#auditLogger', () => {
    let params

    beforeEach(() => {
      params = {
        type: AUDIT_LOGGER_TYPE.MOVEMENT_CREATED,
        traceId: 'abc-def-123',
        version: 2,
        data: {
          wasteTrackingId: '2578ZCY8',
          receipt: { apiCode: '926a654e-f87d-4348-bf0c-2c21ab954e09' }
        }
      }
    })

    it('should call the audit endpoint', () => {
      const auditSpy = jest.spyOn(cdpAuditing, 'audit')

      const result = auditLogger(params)

      expect(result).toBeTruthy()
      expect(auditSpy).toHaveBeenCalledWith({
        type: params.type,
        traceId: params.traceId,
        version: params.version,
        data: params.data
      })
    })

    it('should call the audit endpoint with a default version', () => {
      const auditSpy = jest.spyOn(cdpAuditing, 'audit')

      const result = auditLogger({
        ...params,
        version: undefined
      })

      expect(result).toBeTruthy()
      expect(auditSpy).toHaveBeenCalledWith({
        type: params.type,
        traceId: params.traceId,
        version: 1,
        data: params.data
      })
    })

    it('should log an error when given an invalid type', () => {
      const errorLogSpy = jest.spyOn(logger.createLogger(), 'error')

      const result = auditLogger({
        ...params,
        type: 'created'
      })

      expect(result).toBeFalsy()
      expect(errorLogSpy).toHaveBeenCalledWith(
        { type: 'created', traceId: params.traceId, version: params.version },
        `Failed to call audit endpoint: Audit type must be one of: ${Object.values(AUDIT_LOGGER_TYPE).join(', ')}`
      )
    })

    it('should log an error when not given data', () => {
      const errorLogSpy = jest.spyOn(logger.createLogger(), 'error')

      const result = auditLogger({
        ...params,
        data: undefined
      })

      expect(result).toBeFalsy()
      expect(errorLogSpy).toHaveBeenCalledWith(
        { type: params.type, traceId: params.traceId, version: params.version },
        'Failed to call audit endpoint: Audit data must be provided as an object'
      )
    })

    it('should log an error when not given data as an object', () => {
      const errorLogSpy = jest.spyOn(logger.createLogger(), 'error')

      const result = auditLogger({
        ...params,
        data: 'Movement Created'
      })

      expect(result).toBeFalsy()
      expect(errorLogSpy).toHaveBeenCalledWith(
        { type: params.type, traceId: params.traceId, version: params.version },
        'Failed to call audit endpoint: Audit data must be provided as an object'
      )
    })

    it('should throw an error if shouldThrowError is set', () => {
      expect(() =>
        auditLogger({
          ...params,
          data: 'Movement Created',
          shouldThrowError: true
        })
      ).toThrowError(
        'Failed to call audit endpoint: Audit data must be provided as an object'
      )
    })
  })
})
