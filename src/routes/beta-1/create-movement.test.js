import { HTTP_STATUS } from '@defra/waste-movement-utils'
import * as movementCreate from '../../services/movement-create-v2.js'
import { config } from '../../config.js'
import {
  apiCode1,
  apiCode3,
  base64EncodedOrgApiCodes
} from '../../test/data/apiCodes.js'
import {
  requestBasicAuthTest1,
  userBasicAuthTest1
} from '../../test/data/basic-auth.js'
import { createServer } from '../../server.js'
import { createMovementObject } from '../../test/utils/createMovementRequest.js'

const backoffOptionsConfig = { numOfAttempts: 3, startingDelay: 1 }

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockReturnValue(true)
}))

jest.mock('@defra/waste-movement-utils', () => {
  const originalModule = jest.requireActual('@defra/waste-movement-utils')

  return {
    ...originalModule,
    backoffOptions: () => backoffOptionsConfig
  }
})

jest.mock('../../common/helpers/http-client.js', () => ({
  httpClients: {
    wasteTracking: {
      get: jest
        .fn()
        .mockResolvedValue({ payload: { wasteTrackingId: '26S8EYDJ' } })
    }
  }
}))

describe('movement Route Tests version: beta-1', () => {
  let server
  const endpointVersion = 'beta-1'
  const errorMessage = 'Database connection failed'
  const traceId = 'created-trace-id-123'
  const apiCode = apiCode1
  const goodPayload = { apiCode }

  beforeAll(async () => {
    config.set('orgApiCodes', base64EncodedOrgApiCodes)

    process.env.ACCESS_CRED_TEST1 = userBasicAuthTest1

    server = await createServer()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('creates a movement', async () => {
    const createMovementRecordSpy = jest
      .spyOn(movementCreate, 'createMovementRecord')
      .mockResolvedValue(goodPayload)

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { movementId: expect.any(String) },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toEqual(traceId) //expect.any(String))
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(1)
  })

  it('handles error when creating a movement fails', async () => {
    const createMovementRecordSpy = jest
      .spyOn(movementCreate, 'createMovementRecord')
      .mockRejectedValue(new Error(errorMessage))

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: goodPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      type: 'about:blank',
      title: 'Error',
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      detail: 'Database connection failed',
      instance: '/beta-1/movements'
    })
    expect(headers['content-type']).toEqual('application/problem+json')

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(
      backoffOptionsConfig.numOfAttempts
    )
  })

  it('returns an error when validation fails and does not create a movement', async () => {
    const invalidPayload = {}
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)

    expect(result).toEqual({
      type: 'https://example.com/errors/validation-error',
      title: "Your request parameters didn't validate",
      status: HTTP_STATUS.BAD_REQUEST,
      detail: 'Validation failed for 1 field(s)',
      instance: '/beta-1/movements',
      'invalid-params': [
        {
          name: 'apiCode',
          reason: 'apiCode is required'
        }
      ]
    })

    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('returns an error when apiCode validation fails and does not create a movement', async () => {
    const invalidPayload = {
      apiCode: apiCode3
    }
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(result).toEqual({
      type: 'about:blank',
      title: 'ValidationError',
      status: HTTP_STATUS.BAD_REQUEST,
      detail: 'the API Code supplied is invalid',
      instance: '/beta-1/movements'
    })
    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('should return 401 when request is unauthenticated', async () => {
    const invalidPayload = {
      apiCode: apiCode3
    }
    const createMovementRecordSpy = jest.spyOn(
      movementCreate,
      'createMovementRecord'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(result).toEqual({
      error: 'Unauthorized',
      message: 'Missing authentication',
      statusCode: HTTP_STATUS.UNAUTHORIZED
    })
    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
    expect(createMovementRecordSpy).toHaveBeenCalledTimes(0)
  })

  it('should return 401 when request is unauthenticated', async () => {
    const { statusCode } = await server.inject({
      method: 'POST',
      url: `/${endpointVersion}/movements`,
      payload: createMovementObject()
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
  })
})
