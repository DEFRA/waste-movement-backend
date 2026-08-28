import { HTTP_STATUS } from '@defra/waste-movement-utils'
import * as deliveryCreate from '../../services/delivery-create.js'
import { config } from '../../config.js'
import {
  apiCode1,
  apiCode3,
  base64EncodedOrgApiCodes,
  orgId1
} from '../../test/data/apiCodes.js'
import {
  requestBasicAuthTest1,
  userBasicAuthTest1
} from '../../test/data/basic-auth.js'
import { createServer } from '../../server.js'

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
        .mockResolvedValue({ payload: { wasteTrackingId: '25KMT4Z9' } })
    }
  }
}))

describe('POST /beta-1/deliveries', () => {
  let server
  const movementId1 = '25HRA0B1'
  const movementId2 = '25HRA0B2'
  const url = '/beta-1/deliveries'
  const authHeaders = { Authorization: `Basic ${requestBasicAuthTest1}` }

  beforeAll(async () => {
    config.set('orgApiCodes', base64EncodedOrgApiCodes)
    process.env.ACCESS_CRED_TEST1 = userBasicAuthTest1

    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(async () => {
    jest.clearAllMocks()
    await server.db.collection('movements').deleteMany({})
    await server.db.collection('deliveries').deleteMany({})
  })

  it('records a delivery and returns 201 with the envelope shape', async () => {
    await server.db
      .collection('movements')
      .insertMany([{ movementId: movementId1 }, { movementId: movementId2 }])

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1, movementIds: [movementId1, movementId2] },
      headers: authHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId: '25KMT4Z9' },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toBeDefined()

    const recordInDb = await server.db
      .collection('deliveries')
      .findOne({ deliveryId: '25KMT4Z9' })

    expect(recordInDb).toMatchObject({
      deliveryId: '25KMT4Z9',
      movementIds: [movementId1, movementId2],
      orgId: orgId1
    })
  })

  it('echoes the inbound x-cdp-request-id as x-request-id', async () => {
    await server.db
      .collection('movements')
      .insertOne({ movementId: movementId1 })

    const { headers } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1, movementIds: [movementId1] },
      headers: { ...authHeaders, 'x-cdp-request-id': 'trace-id-123' }
    })

    expect(headers['x-request-id']).toBe('trace-id-123')
  })

  // Error formatting for /beta-1 endpoints is a follow-up - for now errors fall
  // through to the existing service-wide error handling.
  it('returns a 400 when required fields are missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {},
      headers: authHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'apiCode', errorType: 'NotProvided' }),
        expect.objectContaining({
          key: 'movementIds',
          errorType: 'NotProvided'
        })
      ])
    )
  })

  it('returns a 400 when the apiCode is invalid', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode3, movementIds: [movementId1] },
      headers: authHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      validation: {
        errors: [
          {
            key: 'apiCode',
            errorType: 'InvalidValue',
            message: 'the API Code supplied is invalid'
          }
        ]
      }
    })
  })

  it('returns a 400 when a movementId does not exist', async () => {
    await server.db
      .collection('movements')
      .insertOne({ movementId: movementId1 })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        apiCode: apiCode1,
        movementIds: [movementId1, movementId2]
      },
      headers: authHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      statusCode: HTTP_STATUS.BAD_REQUEST,
      error: 'Error',
      message: `No movement exists for movement ID(s): ${movementId2}`
    })
  })

  it('returns a 500 when persistence fails', async () => {
    await server.db
      .collection('movements')
      .insertOne({ movementId: movementId1 })

    jest
      .spyOn(deliveryCreate, 'createDeliveryRecord')
      .mockRejectedValue(new Error('Database connection failed'))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1, movementIds: [movementId1] },
      headers: authHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      error: 'Error',
      message: 'Database connection failed'
    })
  })

  it('returns 401 when unauthenticated', async () => {
    const { statusCode } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1, movementIds: [movementId1] }
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
  })
})
