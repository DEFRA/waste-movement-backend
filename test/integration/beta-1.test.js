import { expect, describe, beforeAll, afterAll, it } from '@jest/globals'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { startTestService } from './helpers/test-service.js'
import { createWasteTrackingStub } from './helpers/waste-tracking-stub.js'
import { httpRequest } from './helpers/http.js'
import { expectStandardHeaders } from './helpers/expect-standard-headers.js'
import { describeBetaEndpointTests } from './helpers/beta-endpoint-tests.js'
import { apiCode1 } from '../../src/test/data/apiCodes.js'

describe('beta-1', () => {
  let testService
  let wasteTrackingStub
  const version = 'beta-1'

  beforeAll(async () => {
    wasteTrackingStub = createWasteTrackingStub()
    await wasteTrackingStub.start()
    testService = await startTestService()
  })

  afterAll(async () => {
    await testService.stop()
    await wasteTrackingStub.stop()
  })

  // Shared error formatting and RFC9457 compliance tests
  describeBetaEndpointTests(
    version,
    () => testService,
    () => wasteTrackingStub,
    {
      apiCode1,
      minimalProducer: {}, // beta-1 doesn't require producer
      requiresProducer: false
    }
  )

  it('POST /beta-1/movements creates a movement', async () => {
    const res = await httpRequest(testService.baseUrl, '/beta-1/movements', {
      method: 'POST',
      body: { apiCode: apiCode1 }
    })

    expect(res.status).toEqual(HTTP_STATUS.CREATED)
    expect(res.body).toEqual({
      data: { movementId: expect.any(String) },
      validation: { warnings: [] }
    })
    expectStandardHeaders(res)
  })

  it('POST /beta-1/movements/{movementId}/collection creates a collection', async () => {
    const createRes = await httpRequest(
      testService.baseUrl,
      '/beta-1/movements',
      { method: 'POST', body: { apiCode: apiCode1 } }
    )
    const { movementId } = createRes.body.data

    const res = await httpRequest(
      testService.baseUrl,
      `/beta-1/movements/${movementId}/collection`,
      { method: 'POST', body: { apiCode: apiCode1 } }
    )

    expect(res.status).toEqual(HTTP_STATUS.CREATED)
    expect(res.body).toEqual({
      data: null,
      validation: { warnings: [] }
    })
    expectStandardHeaders(res)
  })

  it('POST /beta-1/deliveries records a delivery', async () => {
    const createRes = await httpRequest(
      testService.baseUrl,
      '/beta-1/movements',
      { method: 'POST', body: { apiCode: apiCode1 } }
    )
    const { movementId } = createRes.body.data

    const res = await httpRequest(testService.baseUrl, '/beta-1/deliveries', {
      method: 'POST',
      body: { apiCode: apiCode1, movementIds: [movementId] }
    })

    expect(res.status).toEqual(HTTP_STATUS.CREATED)
    expect(res.body.data.deliveries).toHaveLength(1)
    expect(res.body.data.deliveries[0].movementIds).toEqual([movementId])
    expectStandardHeaders(res)
  })

  it('POST /beta-1/deliveries/{deliveryId}/receipt records a receipt against a delivery', async () => {
    const createMovementRes = await httpRequest(
      testService.baseUrl,
      '/beta-1/movements',
      { method: 'POST', body: { apiCode: apiCode1 } }
    )
    const { movementId } = createMovementRes.body.data

    const createDeliveryRes = await httpRequest(
      testService.baseUrl,
      '/beta-1/deliveries',
      {
        method: 'POST',
        body: { apiCode: apiCode1, movementIds: [movementId] }
      }
    )
    const { deliveryId } = createDeliveryRes.body.data.deliveries[0]

    const res = await httpRequest(
      testService.baseUrl,
      `/beta-1/deliveries/${deliveryId}/receipt`,
      { method: 'POST', body: { apiCode: apiCode1 } }
    )

    expect(res.status).toEqual(HTTP_STATUS.CREATED)
    expect(res.body).toEqual({
      data: { deliveryId },
      validation: { warnings: [] }
    })
    expectStandardHeaders(res)
  })

  it('POST /beta-1/receipts records a receipt without a delivery', async () => {
    const res = await httpRequest(testService.baseUrl, '/beta-1/receipts', {
      method: 'POST',
      body: { apiCode: apiCode1, reason: 'No prior movement trail' }
    })

    expect(res.status).toEqual(HTTP_STATUS.CREATED)
    expect(res.body).toEqual({
      data: { deliveryId: expect.any(String) },
      validation: { warnings: [] }
    })
    expectStandardHeaders(res)
  })

  describe('beta-1 specific error cases', () => {
    it('rejects collection creation for non-existent movement', async () => {
      const res = await httpRequest(
        testService.baseUrl,
        '/beta-1/movements/NONEXISTENT/collection',
        { method: 'POST', body: { apiCode: apiCode1 } }
      )

      expect(res.status).toEqual(HTTP_STATUS.NOT_FOUND)
      expect(res.body).toHaveProperty('title')
      expect(res.body.title).toContain('Not Found')
    })

    it('rejects delivery recording with missing movementIds', async () => {
      const res = await httpRequest(testService.baseUrl, '/beta-1/deliveries', {
        method: 'POST',
        body: { apiCode: apiCode1 }
      })

      expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(res.body).toHaveProperty('title')
      expect(res.body.title).toContain('Bad Request')
    })

    it('rejects delivery recording with non-existent movement', async () => {
      const res = await httpRequest(testService.baseUrl, '/beta-1/deliveries', {
        method: 'POST',
        body: { apiCode: apiCode1, movementIds: ['NONEXISTENT'] }
      })

      expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(res.body).toHaveProperty('title')
      expect(res.body.title).toContain('Bad Request')
    })

    it('rejects receipt recording with missing apiCode', async () => {
      const res = await httpRequest(testService.baseUrl, '/beta-1/receipts', {
        method: 'POST',
        body: { reason: 'Some reason' }
      })

      expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(res.body).toHaveProperty('title')
      expect(res.body.title).toContain('Bad Request')
    })
  })
})
