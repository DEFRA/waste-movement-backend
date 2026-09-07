import { HTTP_STATUS } from '@defra/waste-movement-utils'
import * as delivery from '../../services/delivery.js'
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
const reason =
  'No delivery was recorded prior to receipt; waste received directly from the producer.'

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

describe('POST /beta-1/receipts', () => {
  let server
  const url = '/beta-1/receipts'
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
    await server.db.collection('deliveries').deleteMany({})
  })

  it('mints an empty delivery, acknowledges receipt against it and returns 201 with the envelope shape', async () => {
    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1, reason },
      headers: authHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId: '25KMT4Z9' },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toBeDefined()

    const deliveryInDb = await server.db
      .collection('deliveries')
      .findOne({ deliveryId: '25KMT4Z9' })

    expect(deliveryInDb).toMatchObject({
      deliveryId: '25KMT4Z9',
      movementIds: [],
      orgId: orgId1
    })
  })

  it('echoes the inbound x-cdp-request-id as x-request-id', async () => {
    const { headers } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1, reason },
      headers: { ...authHeaders, 'x-cdp-request-id': 'trace-id-123' }
    })

    expect(headers['x-request-id']).toBe('trace-id-123')
  })

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
        expect.objectContaining({ key: 'reason', errorType: 'NotProvided' })
      ])
    )
  })

  it('returns a 400 when the apiCode is invalid', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode3, reason },
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

  it('returns a 500 when persisting the delivery fails', async () => {
    jest
      .spyOn(delivery, 'createDeliveryRecord')
      .mockRejectedValue(new Error('Database connection failed'))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1, reason },
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
      payload: { apiCode: apiCode1, reason }
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
  })
})
