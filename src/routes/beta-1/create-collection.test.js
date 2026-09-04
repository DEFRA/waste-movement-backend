import { HTTP_STATUS } from '@defra/waste-movement-utils'
import * as movementService from '../../services/movement.js'
import { config } from '../../config.js'
import { apiCode1, base64EncodedOrgApiCodes } from '../../test/data/apiCodes.js'
import {
  requestBasicAuthTest1,
  userBasicAuthTest1
} from '../../test/data/basic-auth.js'
import { createServer } from '../../server.js'

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockReturnValue(true)
}))

jest.mock('../../common/helpers/http-client.js', () => ({
  httpClients: {
    wasteTracking: {
      get: jest
        .fn()
        .mockResolvedValue({ payload: { wasteTrackingId: '26S8EYDJ' } })
    }
  }
}))

describe('collection Route Tests version: beta-1', () => {
  let server
  const endpointVersion = 'beta-1'
  const errorMessage = 'Database connection failed'
  const traceId = 'created-trace-id-123'
  const apiCode = apiCode1
  const goodPayload = { apiCode }
  const goodMovementId = 'movementId'

  beforeAll(async () => {
    config.set('orgApiCodes', base64EncodedOrgApiCodes)

    process.env.ACCESS_CRED_TEST1 = userBasicAuthTest1

    server = await createServer()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('creates a collection when a valid apiCode and movementId are provided', async () => {
    const getMovementRecordSpy = jest
      .spyOn(movementService, 'getMovementRecord')
      .mockResolvedValue({ id: goodMovementId })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements/${goodMovementId}/collection`,
      payload: goodPayload,
      headers: {
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({})
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  it('handles when given movementId is not in the system', async () => {
    const getMovementRecordSpy = jest
      .spyOn(movementService, 'getMovementRecord')
      .mockResolvedValue(null)

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements/${goodMovementId}/collection`,
      payload: goodPayload,
      headers: {
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.NOT_FOUND)
    expect(result).toEqual({
      error: 'Not Found',
      message: 'movementId not found',
      statusCode: HTTP_STATUS.NOT_FOUND
    })
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  it('returns an error when apiCode validation fails', async () => {
    const invalidPayload = {}
    const getMovementRecordSpy = jest.spyOn(
      movementService,
      'getMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements/${goodMovementId}/collection`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.validation.errors).toEqual([
      {
        errorType: 'NotProvided',
        key: 'apiCode',
        message: '"apiCode" is required'
      }
    ])
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('handles error when getting movement', async () => {
    const getMovementRecordSpy = jest
      .spyOn(movementService, 'getMovementRecord')
      .mockRejectedValue(new Error(errorMessage))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements/${goodMovementId}/collection`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      error: 'Error',
      message: 'Database connection failed',
      statusCode: 500
    })

    expect(getMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  it('should immediately return 401 when request is unauthenticated', async () => {
    const getMovementRecordSpy = jest.spyOn(
      movementService,
      'getMovementRecord'
    )

    const { statusCode } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements/${goodMovementId}/collection`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
    expect(getMovementRecordSpy).toHaveBeenCalledTimes(0)
  })
})
