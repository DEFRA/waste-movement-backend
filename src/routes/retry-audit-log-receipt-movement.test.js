import hapi from '@hapi/hapi'
import { retryAuditLogReceiptMovement } from './retry-audit-log-receipt-movement.js'
import { requestLogger } from '../common/helpers/logging/request-logger.js'
import { mongoDb } from '../common/helpers/mongodb.js'
import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'
import { apiCode1, base64EncodedOrgApiCodes } from '../test/data/apiCodes.js'
import { createReceiptMovement } from './create-receipt-movement.js'
import { updateReceiptMovement } from './update-receipt-movement.js'
import { config } from '../config.js'
import { requestTracing } from '../common/helpers/request-tracing.js'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import * as auditLogger from '../common/helpers/logging/audit-logger.js'
import { AUDIT_LOGGER_TYPE } from '../common/constants/audit-logger.js'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import * as cdpAuditing from '@defra/cdp-auditing'

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockImplementation(() => true)
}))

describe('Retry Audit Log Receipt Movement Route Tests', () => {
  let server
  let mongoClient
  let testMongoDb
  let replicaSet
  let mongoUri
  let wasteInputsRecord
  let wasteInputsHistoryRecord

  const traceId = '64a4385a4447a8b1608b5b338d0a3157'
  const traceId2 = '10bd784593b7a4ffa2d912ee1c6ab363'
  const wasteTrackingId = generateWasteTrackingId()
  const wasteTrackingId2 = generateWasteTrackingId()
  const revision = 2

  beforeAll(async () => {
    const testMongo = await createTestMongoDb(true)
    mongoClient = testMongo.client
    testMongoDb = testMongo.db
    mongoUri = testMongo.mongoUri
    replicaSet = testMongo.replicaSet

    config.set('orgApiCodes', base64EncodedOrgApiCodes)
    config.set('mongo.uri', mongoUri)
    config.set('mongo.readPreference', 'primary')

    server = hapi.server()
    server.route(createReceiptMovement)
    server.route(updateReceiptMovement)
    server.route(retryAuditLogReceiptMovement)
    await server.register([requestLogger, mongoDb, requestTracing])
    await server.initialize()

    const createResult = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: {
        movement: {
          receivingSiteId: 'test-create',
          receiverReference: 'test-create',
          specialHandlingRequirements: 'test-create',
          apiCode: apiCode1
        }
      },
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(createResult.statusCode).toEqual(HTTP_STATUS_CODES.NO_CONTENT)
    expect(createResult.result).toEqual(null)

    const updateResult = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: {
        movement: {
          receivingSiteId: 'test-update',
          receiverReference: 'test-update',
          specialHandlingRequirements: 'test-update',
          apiCode: apiCode1
        }
      },
      headers: {
        'x-cdp-request-id': traceId2
      }
    })

    expect(updateResult.statusCode).toEqual(HTTP_STATUS_CODES.OK)
    expect(updateResult.result).toEqual(null)

    wasteInputsRecord = await testMongoDb
      .collection('waste-inputs')
      .findOne({ wasteTrackingId })

    wasteInputsHistoryRecord = await testMongoDb
      .collection('waste-inputs-history')
      .findOne({ wasteTrackingId })
  })

  afterAll(async () => {
    if (replicaSet) {
      await replicaSet.stop()
    }
    await server.stop()
    await mongoClient.close()
  })

  it('should retry the waste input from the waste-inputs collection when given traceId', async () => {
    const auditLoggerSpy = jest.spyOn(auditLogger, 'auditLogger')

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/movements/retry-audit-log',
      payload: { traceId: traceId2 }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.OK)
    expect(result).toEqual({})

    expect(auditLoggerSpy).toHaveBeenCalledWith({
      type: AUDIT_LOGGER_TYPE.MOVEMENT_UPDATED,
      traceId: traceId2,
      data: wasteInputsRecord,
      shouldThrowError: true
    })
  })

  it('should retry the waste input from the waste-inputs collection when given wasteTrackingId and revision', async () => {
    const auditLoggerSpy = jest.spyOn(auditLogger, 'auditLogger')

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/movements/retry-audit-log',
      payload: { wasteTrackingId, revision }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.OK)
    expect(result).toEqual({})

    expect(auditLoggerSpy).toHaveBeenCalledWith({
      type: AUDIT_LOGGER_TYPE.MOVEMENT_UPDATED,
      traceId: traceId2,
      data: wasteInputsRecord,
      shouldThrowError: true
    })
  })

  it('should retry the waste input from the waste-inputs-history collection when given traceId', async () => {
    const auditLoggerSpy = jest.spyOn(auditLogger, 'auditLogger')

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/movements/retry-audit-log',
      payload: { traceId }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.OK)
    expect(result).toEqual({})

    expect(auditLoggerSpy).toHaveBeenCalledWith({
      type: AUDIT_LOGGER_TYPE.MOVEMENT_CREATED,
      traceId,
      data: wasteInputsHistoryRecord,
      shouldThrowError: true
    })
  })

  it('should retry the waste input from the waste-inputs-history collection when given wasteTrackingId and revision', async () => {
    const auditLoggerSpy = jest.spyOn(auditLogger, 'auditLogger')

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/movements/retry-audit-log',
      payload: { wasteTrackingId, revision: 1 }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.OK)
    expect(result).toEqual({})

    expect(auditLoggerSpy).toHaveBeenCalledWith({
      type: AUDIT_LOGGER_TYPE.MOVEMENT_CREATED,
      traceId,
      data: wasteInputsHistoryRecord,
      shouldThrowError: true
    })
  })

  it('should return an error when the waste input cannot be found with traceId', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/movements/retry-audit-log',
      payload: { traceId: '997776364a3a0546c18a76d042adf285' }
    })

    expect(statusCode).toEqual(404)
    expect(result).toEqual({
      error: 'Not Found',
      message:
        'Waste input with values {"traceId":"997776364a3a0546c18a76d042adf285"} not found',
      statusCode: 404
    })
  })

  it('should return an error when the waste input cannot be found with wasteTrackingId and revision', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/movements/retry-audit-log',
      payload: { wasteTrackingId: wasteTrackingId2, revision }
    })

    expect(statusCode).toEqual(404)
    expect(result).toEqual({
      error: 'Not Found',
      message: `Waste input with values {"wasteTrackingId":"${wasteTrackingId2}","revision":${revision}} not found`,
      statusCode: 404
    })
  })

  it('should handle error when retrying a waste input fails', async () => {
    const errorMessage = 'Internal Server Error'

    cdpAuditing.audit.mockImplementation(() => {
      throw new Error(errorMessage)
    })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/movements/retry-audit-log',
      payload: { traceId }
    })

    expect(statusCode).toEqual(500)
    expect(result).toEqual({
      error: 'Error',
      message: `Failed to call audit endpoint: ${errorMessage}`,
      statusCode: 500
    })
  })
})
