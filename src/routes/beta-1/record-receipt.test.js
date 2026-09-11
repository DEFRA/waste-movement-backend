import { HTTP_STATUS } from '@defra/waste-movement-utils'
import * as delivery from '../../services/delivery.js'
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

describe('POST /beta-1/deliveries/{deliveryId}/receipt', () => {
  let server
  const deliveryId = '25KMT4Z9'
  const url = `/beta-1/deliveries/${deliveryId}/receipt`
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

  it('acknowledges receipt against an existing delivery and returns 201 with the envelope shape', async () => {
    await server.db.collection('deliveries').insertOne({ deliveryId })

    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1 },
      headers: authHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toBeDefined()
  })

  it('echoes the inbound x-cdp-request-id as x-request-id', async () => {
    await server.db.collection('deliveries').insertOne({ deliveryId })

    const { headers } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1 },
      headers: { ...authHeaders, 'x-cdp-request-id': 'trace-id-123' }
    })

    expect(headers['x-request-id']).toBe('trace-id-123')
  })

  it('returns a 404 when the delivery does not exist', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1 },
      headers: authHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.NOT_FOUND)
    expect(result).toEqual({
      statusCode: HTTP_STATUS.NOT_FOUND,
      error: 'Not Found',
      message: `No delivery exists with delivery ID: ${deliveryId}`
    })
  })

  it('returns a 400 when required fields are missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {},
      headers: authHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      defaultError: new Error('Invalid request payload input'),
      detail: '"apiCode" is required',
      instance: '/beta-1/deliveries/25KMT4Z9/receipt',
      status: HTTP_STATUS.BAD_REQUEST,
      title: 'Bad Request',
      type: 'https://api.example.com/errors/bad-request'
    })
  })

  it('returns a 400 when the apiCode is invalid', async () => {
    await server.db.collection('deliveries').insertOne({ deliveryId })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode3 },
      headers: authHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: 'the API Code supplied is invalid',
      instance: '/beta-1/deliveries/25KMT4Z9/receipt',
      status: HTTP_STATUS.BAD_REQUEST,
      title: 'Bad Request',
      type: 'https://api.example.com/errors/bad-request'
    })
  })

  it('returns a 500 when the delivery lookup fails', async () => {
    const error = 'Database connection failed'
    jest.spyOn(delivery, 'deliveryExists').mockRejectedValue(new Error(error))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1 },
      headers: authHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      detail: error,
      instance: '/beta-1/deliveries/25KMT4Z9/receipt',
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      title: 'Internal Server Error',
      type: 'https://api.example.com/errors/internal-server-error'
    })
  })

  it('returns 401 when unauthenticated', async () => {
    const { statusCode } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1 }
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
  })
})
