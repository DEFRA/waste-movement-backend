import { HTTP_STATUS } from '@defra/waste-movement-utils'
import * as delivery from '../../services/delivery.js'
import { config } from '../../config.js'
import { apiCode1, base64EncodedOrgApiCodes } from '../../test/data/apiCodes.js'
import {
  requestBasicAuthTest1,
  userBasicAuthTest1
} from '../../test/data/basic-auth.js'
import { createServer } from '../../server.js'
import { breakNextResponse } from '../../test/break-next-response.js'
import { organisationHeaders } from '../../test/data/organisation-headers.js'
import {
  brokerOrDealerEntry,
  supportingReference,
  carrier,
  receiver
} from '../../schemas/beta-2/test-helpers.js'

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

describe('POST /beta-2/deliveries/{deliveryId}/receipt', () => {
  let server
  const deliveryId = '25KMT4Z9'
  const url = `/beta-2/deliveries/${deliveryId}/receipt`
  const traceId = 'trace-id-123'
  const authHeaders = { Authorization: `Basic ${requestBasicAuthTest1}` }
  const tracedHeaders = { 'x-cdp-request-id': traceId }
  const tracedAuthHeaders = {
    ...authHeaders,
    ...tracedHeaders,
    ...organisationHeaders
  }

  const expectedTypeBase =
    'https://defra.github.io/digital-waste-tracking-api-docs/preview/problems/'

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
      payload: { carrier, receiver },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId },
      validation: { warnings: [] }
    })
    expect(headers['x-request-id']).toBeDefined()
  })

  it('acknowledges receipt when a brokerOrDealer and supportingReferences are provided', async () => {
    await server.db.collection('deliveries').insertOne({ deliveryId })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        carrier,
        receiver,
        brokerOrDealer: { isPresent: true, items: [brokerOrDealerEntry] },
        supportingReferences: [supportingReference]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      data: { deliveryId },
      validation: { warnings: [] }
    })
  })

  it('returns a 400 when a declared brokerOrDealer has no details', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, receiver, brokerOrDealer: { isPresent: true } },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        pointer: '/brokerOrDealer/items'
      })
    )
  })

  it('returns a 400 when a supportingReference has an unrecognised label', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: {
        carrier,
        receiver,
        supportingReferences: [{ ...supportingReference, label: 'Not A Label' }]
      },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        errorType: 'InvalidValue',
        pointer: '/supportingReferences/0/label'
      })
    )
  })

  it('echoes the inbound x-cdp-request-id as x-request-id', async () => {
    await server.db.collection('deliveries').insertOne({ deliveryId })

    const { headers } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, receiver },
      headers: {
        ...authHeaders,
        ...organisationHeaders,
        'x-cdp-request-id': 'trace-id-123'
      }
    })

    expect(headers['x-request-id']).toEqual(traceId)
  })

  it('returns a 404 when the delivery does not exist', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, receiver },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.NOT_FOUND)
    expect(result).toEqual({
      detail: `No delivery exists with delivery ID: ${deliveryId}`,
      instance: '/beta-2/deliveries/25KMT4Z9/receipt',
      title: 'Not Found',
      type: `${expectedTypeBase}not-found`,
      requestId: traceId
    })
  })

  it('returns a 400 when the deliveryId is not in the ID format', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/beta-2/deliveries/NONEXISTENT/receipt',
      payload: {},
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.errors).toEqual([
      {
        errorType: 'InvalidFormat',
        message: 'must match pattern "^[0-9]{2}[A-Z0-9]{6,7}$"',
        pointer: '/deliveryId'
      }
    ])
  })

  // apiCode is sent in the x-api-code header and resolved by the
  // external API, so the backend rejects it in the body.
  it('returns a 400 when apiCode is sent in the body', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1, carrier, receiver },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotAllowed',
          message: 'must NOT have additional properties',
          pointer: '/apiCode'
        }
      ],
      instance: '/beta-2/deliveries/25KMT4Z9/receipt',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when carrier is missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { receiver },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: '"carrier" is required',
          pointer: '/carrier'
        }
      ],
      instance: '/beta-2/deliveries/25KMT4Z9/receipt',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when receiver is missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: '1 validation error occurred',
      errors: [
        {
          errorType: 'NotProvided',
          message: '"receiver" is required',
          pointer: '/receiver'
        }
      ],
      instance: '/beta-2/deliveries/25KMT4Z9/receipt',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 400 when no organisation was forwarded (unknown or disabled API code)', async () => {
    await server.db.collection('deliveries').insertOne({ deliveryId })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, receiver },
      headers: { ...authHeaders, ...tracedHeaders }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result).toEqual({
      detail: 'the API Code supplied is invalid',
      instance: '/beta-2/deliveries/25KMT4Z9/receipt',
      title: 'Bad Request',
      type: `${expectedTypeBase}bad-request`,
      requestId: traceId
    })
  })

  it('returns a 500 when the delivery lookup fails', async () => {
    const error = 'Database connection failed'
    jest.spyOn(delivery, 'deliveryExists').mockRejectedValue(new Error(error))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, receiver },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: '/beta-2/deliveries/25KMT4Z9/receipt',
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
  })

  it('returns 401 when unauthenticated', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, receiver },
      headers: tracedHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
    expect(result).toEqual({
      detail: 'Missing authentication',
      instance: url,
      title: 'Unauthorized',
      type: `${expectedTypeBase}unauthorized`,
      requestId: traceId
    })
  })

  it('returns a 500 when the response body does not match the response schema', async () => {
    await server.db.collection('deliveries').insertOne({ deliveryId })
    breakNextResponse(server, (body) => ({ ...body, data: {} }))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { carrier, receiver },
      headers: tracedAuthHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      instance: url,
      title: 'Internal Server Error',
      type: `${expectedTypeBase}internal-server-error`,
      requestId: traceId
    })
  })
})
