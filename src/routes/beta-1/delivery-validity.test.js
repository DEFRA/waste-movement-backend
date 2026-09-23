import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { config } from '../../config.js'
import { base64EncodedOrgApiCodes, orgId1 } from '../../test/data/apiCodes.js'
import {
  requestBasicAuthTest1,
  userBasicAuthTest1
} from '../../test/data/basic-auth.js'
import { createServer } from '../../server.js'
import { RESERVATION_STATUS } from '../../services/reservation.js'

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockReturnValue(true)
}))

jest.mock('../../common/helpers/http-client.js', () => ({
  httpClients: {
    wasteTracking: {
      get: jest.fn()
    }
  }
}))

describe('GET /beta-1/deliveries/{deliveryId}/validity', () => {
  let server
  const authHeaders = { Authorization: `Basic ${requestBasicAuthTest1}` }
  const urlFor = (deliveryId) => `/beta-1/deliveries/${deliveryId}/validity`

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
    await server.db.collection('deliveries').deleteMany({})
  })

  it('returns a 404 for an unknown Delivery ID', async () => {
    const { statusCode, result } = await server.inject({
      method: 'GET',
      url: urlFor('unknown-id'),
      headers: authHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.NOT_FOUND)
    expect(result.detail).toMatch(/No Delivery ID is known/)
  })

  it('reports a live reservation as reserved and acceptable', async () => {
    const deliveryId = '25VAL1'
    await server.db.collection('id-reservations').insertOne({
      deliveryId,
      orgId: orgId1,
      status: RESERVATION_STATUS.RESERVED,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    })

    const { statusCode, result } = await server.inject({
      method: 'GET',
      url: urlFor(deliveryId),
      headers: authHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.OK)
    expect(result).toEqual({
      known: true,
      state: 'reserved',
      acceptable: true
    })
  })

  it('reports an expired reservation without a delivery record as expired', async () => {
    const deliveryId = '25VAL2'
    await server.db.collection('id-reservations').insertOne({
      deliveryId,
      orgId: orgId1,
      status: RESERVATION_STATUS.RESERVED,
      expiresAt: new Date(Date.now() - 60_000).toISOString()
    })

    const { result } = await server.inject({
      method: 'GET',
      url: urlFor(deliveryId),
      headers: authHeaders
    })

    expect(result.state).toEqual('expired')
    expect(result.acceptable).toBe(true)
  })

  it('reports a receipted-but-not-yet-delivered ID as awaiting_delivery', async () => {
    const deliveryId = '25VAL3'
    await server.db.collection('deliveries').insertOne({
      deliveryId,
      orgId: orgId1,
      status: 'awaiting_delivery'
    })

    const { result } = await server.inject({
      method: 'GET',
      url: urlFor(deliveryId),
      headers: authHeaders
    })

    expect(result.state).toEqual('awaiting_delivery')
  })

  it('reports a complete delivery as complete', async () => {
    const deliveryId = '25VAL4'
    await server.db.collection('deliveries').insertOne({
      deliveryId,
      orgId: orgId1,
      status: 'complete'
    })

    const { result } = await server.inject({
      method: 'GET',
      url: urlFor(deliveryId),
      headers: authHeaders
    })

    expect(result.state).toEqual('complete')
  })

  it('returns a 404 for a voided reservation', async () => {
    const deliveryId = '25VAL5'
    await server.db.collection('id-reservations').insertOne({
      deliveryId,
      orgId: orgId1,
      status: RESERVATION_STATUS.VOID,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    })

    const { statusCode } = await server.inject({
      method: 'GET',
      url: urlFor(deliveryId),
      headers: authHeaders
    })

    expect(statusCode).toEqual(HTTP_STATUS.NOT_FOUND)
  })

  it('returns 401 when unauthenticated', async () => {
    const { statusCode } = await server.inject({
      method: 'GET',
      url: urlFor('25VAL6')
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
  })
})
