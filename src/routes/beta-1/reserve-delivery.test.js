import { HTTP_STATUS } from '@defra/waste-movement-utils'
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
import { DEFAULT_OUTSTANDING_CAP } from '../../services/reservation.js'
import { httpClients } from '../../common/helpers/http-client.js'

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

let idCounter
jest.mock('../../common/helpers/http-client.js', () => ({
  httpClients: {
    wasteTracking: {
      get: jest.fn()
    }
  }
}))

describe('POST /beta-1/deliveries/reserve', () => {
  let server
  const url = '/beta-1/deliveries/reserve'
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
    await server.db.collection('id-reservations').deleteMany({})

    idCounter = 0
    httpClients.wasteTracking.get.mockImplementation(() => {
      idCounter += 1
      return Promise.resolve({
        payload: { wasteTrackingId: `25RES${idCounter}` }
      })
    })
  })

  it('reserves a batch and returns 201 with the envelope shape', async () => {
    const { statusCode, result, headers } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1, count: 3 },
      headers: { ...authHeaders, 'Idempotency-Key': 'batch-1' }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result.reservations).toHaveLength(3)
    result.reservations.forEach((reservation) => {
      expect(reservation.deliveryId).toEqual(expect.any(String))
      expect(reservation.expiresAt).toEqual(expect.any(String))
    })
    expect(result.outstanding).toBe(3)
    expect(result.cap).toBe(DEFAULT_OUTSTANDING_CAP)
    expect(headers['x-request-id']).toBeDefined()
  })

  it('replays an identical request with the same Idempotency-Key', async () => {
    const headers = { ...authHeaders, 'Idempotency-Key': 'batch-replay' }
    const payload = { apiCode: apiCode1, count: 2 }

    const first = await server.inject({ method: 'POST', url, payload, headers })
    const second = await server.inject({
      method: 'POST',
      url,
      payload,
      headers
    })

    expect(second.statusCode).toEqual(HTTP_STATUS.OK)
    expect(second.result.reservations).toEqual(first.result.reservations)
  })

  it('returns a 400 when the Idempotency-Key header is missing', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1, count: 2 },
      headers: authHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.detail).toEqual('Idempotency-Key header is required')
  })

  it('returns a 400 when the apiCode is invalid', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode3, count: 2 },
      headers: { ...authHeaders, 'Idempotency-Key': 'batch-bad-org' }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(result.detail).toEqual('the API Code supplied is invalid')
  })

  it('returns a 409 when the outstanding cap would be exceeded', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1, count: DEFAULT_OUTSTANDING_CAP + 1 },
      headers: { ...authHeaders, 'Idempotency-Key': 'batch-over-cap' }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CONFLICT)
    expect(result.detail).toMatch(/outstanding reservation cap/)
  })

  it('returns 401 when unauthenticated', async () => {
    const { statusCode } = await server.inject({
      method: 'POST',
      url,
      payload: { apiCode: apiCode1, count: 2 },
      headers: { 'Idempotency-Key': 'batch-unauth' }
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
  })
})
