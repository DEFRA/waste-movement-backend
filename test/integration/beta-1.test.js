import { randomUUID } from 'node:crypto'
import { expect, describe, beforeAll, afterAll, it } from '@jest/globals'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { startTestService } from './helpers/test-service.js'
import { createWasteTrackingStub } from './helpers/waste-tracking-stub.js'
import { httpRequest } from './helpers/http.js'
import { expectStandardHeaders } from './helpers/expect-standard-headers.js'
import { describeBetaEndpointTests } from './helpers/beta-endpoint-tests.js'
import { apiCode1 } from '../../src/test/data/apiCodes.js'
import { ObjectId } from 'mongodb'
import { expectProblemResponse } from './helpers/expect-problem-response.js'
import { expectResponseBodyHasCorrectShape } from './helpers/expect-response-body-has-shape.js'

describe('beta-1', () => {
  let testService
  let wasteTrackingStub
  const version = 'beta-1'

  beforeAll(async () => {
    wasteTrackingStub = createWasteTrackingStub()
    await wasteTrackingStub.start()
    testService = await startTestService({
      wasteTrackingUrl: wasteTrackingStub.baseUrl
    })
  })

  afterAll(async () => {
    await testService.stop()
    await wasteTrackingStub.stop()
  })

  // Shared error formatting and RFC9457 compliance tests
  describeBetaEndpointTests(version, () => testService, {
    apiCode1,
    minimalProducer: {}, // beta-1 doesn't require producer
    requiresProducer: false
  })

  it('POST /beta-1/movements creates a movement', async () => {
    const { status, body, headers } = await httpRequest(
      testService.baseUrl,
      '/beta-1/movements',
      {
        method: 'POST',
        body: { apiCode: apiCode1 }
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: { movementId: expect.any(String) },
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)

    const { movementId } = body.data
    const movement = await testService.db
      .collection('movements')
      .findOne({ movementId })

    expect(movement).toEqual({
      _id: expect.any(ObjectId),
      movementId,
      orgId: expect.any(String),
      createdAt: expect.any(String)
    })
  })

  it('POST /beta-1/movements/{movementId}/collection creates a collection', async () => {
    const createRes = await httpRequest(
      testService.baseUrl,
      '/beta-1/movements',
      { method: 'POST', body: { apiCode: apiCode1 } }
    )
    const { movementId } = createRes.body.data

    const { status, body, headers } = await httpRequest(
      testService.baseUrl,
      `/beta-1/movements/${movementId}/collection`,
      { method: 'POST', body: { apiCode: apiCode1 } }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: null,
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)

    const movement = await testService.db
      .collection('movements')
      .findOne({ movementId })

    expect(movement).toMatchObject({
      movementId,
      orgId: expect.any(String),
      createdAt: expect.any(String)
    })
  })

  it('POST /beta-1/deliveries records a delivery', async () => {
    const createRes = await httpRequest(
      testService.baseUrl,
      '/beta-1/movements',
      { method: 'POST', body: { apiCode: apiCode1 } }
    )
    const { movementId } = createRes.body.data

    const { status, body, headers } = await httpRequest(
      testService.baseUrl,
      '/beta-1/deliveries',
      {
        method: 'POST',
        body: { apiCode: apiCode1, movementIds: [movementId] }
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body.data.deliveries).toHaveLength(1)
    expect(body.data.deliveries[0].movementIds).toEqual([movementId])
    expectStandardHeaders(headers)

    const { deliveryId } = body.data.deliveries[0]
    const delivery = await testService.db
      .collection('deliveries')
      .findOne({ deliveryId })

    expect(delivery).toMatchObject({
      _id: expect.any(ObjectId),
      deliveryId,
      orgId: expect.any(String),
      movementIds: [movementId],
      createdAt: expect.any(String)
    })
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

    const { status, body, headers } = await httpRequest(
      testService.baseUrl,
      `/beta-1/deliveries/${deliveryId}/receipt`,
      { method: 'POST', body: { apiCode: apiCode1 } }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: { deliveryId },
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)

    const delivery = await testService.db
      .collection('deliveries')
      .findOne({ deliveryId })

    expect(delivery).toMatchObject({
      deliveryId,
      orgId: expect.any(String),
      movementIds: [movementId],
      createdAt: expect.any(String)
    })
  })

  it('POST /beta-1/receipts records a receipt without a delivery', async () => {
    const reason = 'No prior movement trail'
    const { status, body, headers } = await httpRequest(
      testService.baseUrl,
      '/beta-1/receipts',
      {
        method: 'POST',
        body: { apiCode: apiCode1, reason }
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: { deliveryId: expect.any(String) },
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)

    const { deliveryId } = body.data
    const delivery = await testService.db
      .collection('deliveries')
      .findOne({ deliveryId })

    expect(delivery).toMatchObject({
      _id: expect.any(ObjectId),
      deliveryId,
      orgId: expect.any(String),
      createdAt: expect.any(String)
    })
  })

  describe('beta-1 specific error cases', () => {
    it('rejects collection creation for non-existent movement', async () => {
      const endpoint = '/beta-1/movements/NONEXISTENT/collection'
      const response = await httpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { apiCode: apiCode1 }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.NOT_FOUND,
        type: 'not-found',
        instance: endpoint
      })
    })

    it('rejects delivery recording with missing movementIds', async () => {
      const endpoint = '/beta-1/deliveries'
      const response = await httpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { apiCode: apiCode1 }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
    })

    it('rejects delivery recording with non-existent movement', async () => {
      const endpoint = '/beta-1/deliveries'
      const response = await httpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { apiCode: apiCode1, movementIds: ['NONEXISTENT'] }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })

    it('rejects receipt recording with missing apiCode', async () => {
      const endpoint = '/beta-1/receipts'
      const response = await httpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { reason: 'Some reason' }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
    })
  })
})
