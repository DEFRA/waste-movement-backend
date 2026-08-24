import { auditLogger } from './audit-logger.js'
import * as cdpAuditing from '@defra/cdp-auditing'
import * as logger from '../logging/logger.js'
import { AUDIT_LOGGER_TYPE, METRIC_NAMES } from '@defra/waste-movement-utils'
import { config } from '../../../config.js'

const WASTE_TRACKING_ID = '2578ZCY8'
const API_CODE = '926a654e-f87d-4348-bf0c-2c21ab954e09'
const ORG_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest
    .fn()
    .mockImplementationOnce(() => true)
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
          wasteTrackingId: WASTE_TRACKING_ID,
          receipt: { apiCode: API_CODE }
        },
        wasteTrackingId: WASTE_TRACKING_ID,
        revision: 1
      }
    })

    it('should call the audit endpoint', () => {
      const auditSpy = jest.spyOn(cdpAuditing, 'audit')
      const infoLogSpy = jest.spyOn(logger.createLogger(), 'info')

      const result = auditLogger(params)

      expect(result).toBeTruthy()
      expect(auditSpy).toHaveBeenCalledWith({
        metadata: {
          type: params.type,
          traceId: params.traceId,
          version: params.version
        },
        data: params.data
      })
      expect(infoLogSpy).toHaveBeenCalledWith(
        {
          type: params.type,
          traceId: params.traceId,
          wasteTrackingId: WASTE_TRACKING_ID,
          revision: 1
        },
        `Audit log sent for movement: ${WASTE_TRACKING_ID} revision: 1`
      )
    })

    it('should call the audit endpoint with a default version', () => {
      const auditSpy = jest.spyOn(cdpAuditing, 'audit')

      const result = auditLogger({
        ...params,
        version: undefined
      })

      expect(result).toBeTruthy()
      expect(auditSpy).toHaveBeenCalledWith({
        metadata: { type: params.type, traceId: params.traceId, version: 1 },
        data: params.data
      })
    })

    it('should log an error when given an invalid type', () => {
      const mockLogger = logger.createLogger()
      const errorLogSpy = jest.spyOn(mockLogger, 'error')
      const infoLogSpy = jest.spyOn(mockLogger, 'info')

      const result = auditLogger({
        ...params,
        type: 'created'
      })

      expect(result).toBeFalsy()
      expect(errorLogSpy).toHaveBeenCalledWith(
        {
          type: 'created',
          traceId: params.traceId,
          version: params.version,
          wasteTrackingId: WASTE_TRACKING_ID,
          revision: 1
        },
        `Failed to call audit endpoint: Audit type must be one of: ${Object.values(AUDIT_LOGGER_TYPE).join(', ')}`
      )
      expect(infoLogSpy).toHaveBeenCalledWith(
        `${METRIC_NAMES.AUDIT_ERRORS_FAILED} - created`
      )
    })

    it('should log an error when not given data', () => {
      const mockLogger = logger.createLogger()
      const errorLogSpy = jest.spyOn(mockLogger, 'error')
      const infoLogSpy = jest.spyOn(mockLogger, 'info')

      const result = auditLogger({
        ...params,
        data: undefined
      })

      expect(result).toBeFalsy()
      expect(errorLogSpy).toHaveBeenCalledWith(
        {
          type: params.type,
          traceId: params.traceId,
          version: params.version,
          wasteTrackingId: WASTE_TRACKING_ID,
          revision: 1
        },
        'Failed to call audit endpoint: Audit data must be provided as an object'
      )
      expect(infoLogSpy).toHaveBeenCalledWith(
        `${METRIC_NAMES.AUDIT_ERRORS_FAILED} - ${AUDIT_LOGGER_TYPE.MOVEMENT_CREATED}`
      )
    })

    it('should log an error when not given data as an object', () => {
      const mockLogger = logger.createLogger()
      const errorLogSpy = jest.spyOn(mockLogger, 'error')
      const infoLogSpy = jest.spyOn(mockLogger, 'info')

      const result = auditLogger({
        ...params,
        data: 'Movement Created'
      })

      expect(result).toBeFalsy()
      expect(errorLogSpy).toHaveBeenCalledWith(
        {
          type: params.type,
          traceId: params.traceId,
          version: params.version,
          wasteTrackingId: WASTE_TRACKING_ID,
          revision: 1
        },
        'Failed to call audit endpoint: Audit data must be provided as an object'
      )
      expect(infoLogSpy).toHaveBeenCalledWith(
        `${METRIC_NAMES.AUDIT_ERRORS_FAILED} - ${AUDIT_LOGGER_TYPE.MOVEMENT_CREATED}`
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

    it('should call the audit endpoint when the submitting organisation is not in the excluded list', () => {
      const auditSpy = jest.spyOn(cdpAuditing, 'audit')

      config.set('excludedSubmittingOrganisations', [
        'ffffffff-ffff-ffff-ffff-ffffffffffff'
      ])

      const result = auditLogger({
        ...params,
        data: {
          ...params.data,
          submittingOrganisation: {
            defraCustomerOrganisationId: ORG_ID
          }
        }
      })

      expect(result).toBeTruthy()
      expect(auditSpy).toHaveBeenCalled()
    })

    it('should not call the audit endpoint when the submitting organisation is excluded', () => {
      const auditSpy = jest.spyOn(cdpAuditing, 'audit')
      const infoLogSpy = jest.spyOn(logger.createLogger(), 'info')

      config.set('excludedSubmittingOrganisations', [ORG_ID])

      const result = auditLogger({
        ...params,
        data: {
          ...params.data,
          submittingOrganisation: {
            defraCustomerOrganisationId: ORG_ID
          }
        }
      })

      expect(result).toBeTruthy()
      expect(auditSpy).not.toHaveBeenCalled()
      expect(infoLogSpy).toHaveBeenCalledWith(
        {
          type: params.type,
          traceId: params.traceId,
          wasteTrackingId: WASTE_TRACKING_ID,
          revision: 1
        },
        `Audit log NOT sent as the organisation id is in the exclude list: ${WASTE_TRACKING_ID} revision: 1`
      )
    })
  })
})
