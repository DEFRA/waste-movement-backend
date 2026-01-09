import hapi from '@hapi/hapi'
import { retryAuditLogReceiptMovement } from './retry-audit-log-receipt-movement.js'
import { requestLogger } from '../common/helpers/logging/request-logger.js'
import { mongoDb } from '../common/helpers/mongodb.js'
import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'
import { apiCode1, base64EncodedOrgApiCodes } from '../test/data/apiCodes.js'
import { createReceiptMovement } from './create-receipt-movement.js'
import { config } from '../config.js'
import { requestTracing } from '../common/helpers/request-tracing.js'

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockImplementation(() => true)
}))

describe('Retry Audit Log Receipt Movement Route Tests', () => {
  let server

  const traceId = '64a4385a4447a8b1608b5b338d0a3157'
  const wasteTrackingId = generateWasteTrackingId()
  const revision = 1

  beforeAll(async () => {
    server = hapi.server()
    server.route(createReceiptMovement)
    server.route(retryAuditLogReceiptMovement)
    await server.register([requestLogger, mongoDb, requestTracing])
    await server.initialize()

    config.set('orgApiCodes', base64EncodedOrgApiCodes)

    const createPayload = {
      movement: {
        receivingSiteId: 'test',
        receiverReference: 'test',
        specialHandlingRequirements: 'test',
        apiCode: apiCode1
      }
    }

    const createResult = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: createPayload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(createResult.statusCode).toEqual(204)
    expect(createResult.result).toEqual(null)
  })

  afterAll(async () => {
    await server.stop()
  })

  it('should retry the waste input when given traceId', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/movements/retry-audit-log',
      payload: { traceId }
    })

    expect(statusCode).toEqual(204)
    expect(result).toEqual(null)
  })

  it('should retry the waste input when given wasteTrackingId and revision', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/movements/retry-audit-log',
      payload: { wasteTrackingId, revision }
    })

    expect(statusCode).toEqual(204)
    expect(result).toEqual(null)
  })

  it('should return an error when the waste input cannot be found', async () => {
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

  it('should return an error when given a payload with no values', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/movements/retry-audit-log',
      payload: {}
    })

    expect(statusCode).toEqual(400)
    expect(result).toEqual({
      error: 'Not Found',
      message:
        'Waste input with values {"traceId":"997776364a3a0546c18a76d042adf285"} not found',
      statusCode: 404
    })
  })
})
