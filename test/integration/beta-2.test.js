import { randomUUID } from 'node:crypto'
import { expect, describe, beforeAll, afterAll, it } from '@jest/globals'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { startTestService } from './helpers/test-service.js'
import { createWasteTrackingStub } from './helpers/waste-tracking-stub.js'
import { betaHttpRequest } from './helpers/http.js'
import { expectStandardHeaders } from './helpers/expect-standard-headers.js'
import { describeBetaEndpointTests } from './helpers/beta-endpoint-tests.js'
import { apiCode1 } from '../../src/test/data/apiCodes.js'
import { forwardedOrganisationId } from '../../src/test/data/organisation-headers.js'
import { ObjectId } from 'mongodb'
import { expectProblemResponse } from './helpers/expect-problem-response.js'
import { expectResponseBodyHasCorrectShape } from './helpers/expect-response-body-has-shape.js'
import {
  brokerOrDealerEntry,
  carrier,
  supportingReference
} from '../../src/schemas/beta-2/test-helpers.js'

describe('beta-2', () => {
  let testService
  let wasteTrackingStub
  const version = 'beta-2'
  const intendedCarriers = [carrier]
  const minimalMovementBody = {
    producer: { wasteSource: 'Household' },
    intendedCarriers
  }

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

  const createMovement = async () => {
    const { body } = await betaHttpRequest(
      testService.baseUrl,
      '/beta-2/movements',
      {
        method: 'POST',
        body: { ...minimalMovementBody }
      }
    )
    return body.data.movementId
  }

  // Shared error formatting and RFC9457 compliance tests
  describeBetaEndpointTests(version, () => testService, {
    apiCode1,
    apiCodeInBody: false,
    minimalProducer: minimalMovementBody,
    requiresProducer: true
  })

  describe('POST /beta-2/movements', () => {
    it('creates a movement with minimal payload', async () => {
      const producer = { wasteSource: 'Household' }
      const { status, body, headers } = await betaHttpRequest(
        testService.baseUrl,
        '/beta-2/movements',
        {
          method: 'POST',
          body: { producer, intendedCarriers }
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

      expect(movement).toMatchObject({
        _id: expect.any(ObjectId),
        movementId,
        orgId: forwardedOrganisationId,
        createdAt: expect.any(String)
      })
    })

    it('creates a movement with producer payload', async () => {
      const producer = { wasteSource: 'Household' }
      const { status, body, headers } = await betaHttpRequest(
        testService.baseUrl,
        '/beta-2/movements',
        {
          method: 'POST',
          body: { producer, intendedCarriers }
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
      expect(body).toMatchObject({
        data: { movementId: expect.any(String) },
        validation: { warnings: [] }
      })
      expectStandardHeaders(headers)

      const { movementId } = body.data
      const movement = await testService.db
        .collection('movements')
        .findOne({ movementId })

      expect(movement).toMatchObject({
        _id: expect.any(ObjectId),
        movementId,
        orgId: forwardedOrganisationId,
        createdAt: expect.any(String)
      })
    })

    it('creates a movement with commercial producer', async () => {
      const producer = {
        wasteSource: 'Commercial',
        organisationName: 'ACME Waste Ltd',
        sicCode: '38110',
        authorisationNumber: 'EAS/P/123456',
        address: {
          fullAddress: '10 Industrial Way, Test City',
          postcode: 'TE1 2PQ'
        },
        contactDetails: {
          emailAddress: 'contact@acme.com'
        }
      }
      const { status, body, headers } = await betaHttpRequest(
        testService.baseUrl,
        '/beta-2/movements',
        {
          method: 'POST',
          body: { producer, intendedCarriers }
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
      expect(body).toMatchObject({
        data: { movementId: expect.any(String) },
        validation: { warnings: [] }
      })
      expectStandardHeaders(headers)

      const { movementId } = body.data
      const movement = await testService.db
        .collection('movements')
        .findOne({ movementId })

      expect(movement).toMatchObject({
        _id: expect.any(ObjectId),
        movementId,
        orgId: forwardedOrganisationId,
        createdAt: expect.any(String)
      })
    })
  })

  it('POST /beta-2/movements/{movementId}/collection creates a collection', async () => {
    const createRes = await betaHttpRequest(
      testService.baseUrl,
      '/beta-2/movements',
      {
        method: 'POST',
        body: { ...minimalMovementBody }
      }
    )
    const { movementId } = createRes.body.data

    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      `/beta-2/movements/${movementId}/collection`,
      { method: 'POST', body: { carrier } }
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
      orgId: forwardedOrganisationId,
      createdAt: expect.any(String)
    })
  })

  it('POST /beta-2/movements/{movementId}/collection creates a collection with a brokerOrDealer and supportingReferences', async () => {
    const movementId = await createMovement()

    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      `/beta-2/movements/${movementId}/collection`,
      {
        method: 'POST',
        body: {
          carrier,
          brokerOrDealer: { isPresent: true, items: [brokerOrDealerEntry] },
          supportingReferences: [supportingReference]
        }
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: null,
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)
  })

  it('POST /beta-2/deliveries records a delivery', async () => {
    const createRes = await betaHttpRequest(
      testService.baseUrl,
      '/beta-2/movements',
      {
        method: 'POST',
        body: { ...minimalMovementBody }
      }
    )
    const { movementId } = createRes.body.data

    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      '/beta-2/deliveries',
      {
        method: 'POST',
        body: { movementIds: [movementId], carrier }
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
      orgId: forwardedOrganisationId,
      movementIds: [movementId],
      createdAt: expect.any(String)
    })
  })

  it('POST /beta-2/deliveries/{deliveryId}/receipt records a receipt against a delivery', async () => {
    const createMovementRes = await betaHttpRequest(
      testService.baseUrl,
      '/beta-2/movements',
      {
        method: 'POST',
        body: { ...minimalMovementBody }
      }
    )
    const { movementId } = createMovementRes.body.data

    const createDeliveryRes = await betaHttpRequest(
      testService.baseUrl,
      '/beta-2/deliveries',
      {
        method: 'POST',
        body: { movementIds: [movementId], carrier }
      }
    )
    const { deliveryId } = createDeliveryRes.body.data.deliveries[0]

    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      `/beta-2/deliveries/${deliveryId}/receipt`,
      { method: 'POST', body: { carrier } }
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
      orgId: forwardedOrganisationId,
      movementIds: [movementId],
      createdAt: expect.any(String)
    })
  })

  it('POST /beta-2/receipts records a receipt without a delivery', async () => {
    const reason = 'No prior movement trail'
    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      '/beta-2/receipts',
      {
        method: 'POST',
        body: { reason, carrier }
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
      orgId: forwardedOrganisationId,
      createdAt: expect.any(String)
    })
  })

  it('POST /beta-2/movements/{movementId}/collection creates a collection with specialHandlingRequirements', async () => {
    const movementId = await createMovement()

    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      `/beta-2/movements/${movementId}/collection`,
      {
        method: 'POST',
        body: {
          carrier,
          specialHandlingRequirements: 'Handle with care and keep upright.'
        }
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: null,
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)
  })

  it('POST /beta-2/deliveries records a delivery with supportingReferences', async () => {
    const movementId = await createMovement()

    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      '/beta-2/deliveries',
      {
        method: 'POST',
        body: {
          movementIds: [movementId],
          carrier,
          supportingReferences: [supportingReference]
        }
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body.data.deliveries[0].movementIds).toEqual([movementId])
    expectStandardHeaders(headers)
  })

  it('POST /beta-2/deliveries/{deliveryId}/receipt records a receipt with a brokerOrDealer and supportingReferences', async () => {
    const movementId = await createMovement()
    const createDeliveryRes = await betaHttpRequest(
      testService.baseUrl,
      '/beta-2/deliveries',
      {
        method: 'POST',
        body: { movementIds: [movementId], carrier }
      }
    )
    const { deliveryId } = createDeliveryRes.body.data.deliveries[0]

    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      `/beta-2/deliveries/${deliveryId}/receipt`,
      {
        method: 'POST',
        body: {
          carrier,
          brokerOrDealer: { isPresent: true, items: [brokerOrDealerEntry] },
          supportingReferences: [supportingReference]
        }
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: { deliveryId },
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)
  })

  it('POST /beta-2/receipts records a receipt without a delivery with a brokerOrDealer and supportingReferences', async () => {
    const { status, body, headers } = await betaHttpRequest(
      testService.baseUrl,
      '/beta-2/receipts',
      {
        method: 'POST',
        body: {
          reason: 'No prior movement trail',
          carrier,
          brokerOrDealer: { isPresent: true, items: [brokerOrDealerEntry] },
          supportingReferences: [supportingReference]
        }
      }
    )

    expect(status).toEqual(HTTP_STATUS.CREATED)
    expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
    expect(body).toEqual({
      data: { deliveryId: expect.any(String) },
      validation: { warnings: [] }
    })
    expectStandardHeaders(headers)
  })

  describe('beta-2 specific error cases', () => {
    it('rejects collection creation for non-existent movement', async () => {
      const endpoint = '/beta-2/movements/NONEXISTENT/collection'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { carrier }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.NOT_FOUND,
        type: 'not-found',
        instance: endpoint
      })
    })

    // apiCode is sent in the x-api-code header and resolved by the
    // external API, so the backend rejects it in the body.
    it('rejects collection creation with apiCode in the body', async () => {
      const movementId = await createMovement()
      const endpoint = `/beta-2/movements/${movementId}/collection`
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { apiCode: apiCode1, carrier }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
    })

    it('rejects collection creation without a carrier', async () => {
      const movementId = await createMovement()
      const endpoint = `/beta-2/movements/${movementId}/collection`
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {}
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'NotProvided',
          pointer: '/carrier'
        })
      )
    })

    it('rejects collection creation when a brokerOrDealer is declared with no details', async () => {
      const movementId = await createMovement()
      const endpoint = `/beta-2/movements/${movementId}/collection`
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          carrier,
          brokerOrDealer: { isPresent: true }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'NotProvided',
          pointer: '/brokerOrDealer/items'
        })
      )
    })

    it('rejects collection creation when brokerOrDealer details are given without declaring involvement', async () => {
      const movementId = await createMovement()
      const endpoint = `/beta-2/movements/${movementId}/collection`
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          carrier,
          brokerOrDealer: { isPresent: false, items: [brokerOrDealerEntry] }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'NotAllowed',
          pointer: '/brokerOrDealer/items'
        })
      )
    })

    it('rejects collection creation when a supportingReference has an unrecognised label', async () => {
      const movementId = await createMovement()
      const endpoint = `/beta-2/movements/${movementId}/collection`
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          carrier,
          supportingReferences: [
            { ...supportingReference, label: 'Not A Label' }
          ]
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'InvalidValue',
          pointer: '/supportingReferences/0/label'
        })
      )
    })

    it('rejects delivery recording without a carrier', async () => {
      const movementId = await createMovement()
      const endpoint = '/beta-2/deliveries'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { movementIds: [movementId] }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'NotProvided',
          pointer: '/carrier'
        })
      )
    })

    it('rejects delivery recording with missing movementIds', async () => {
      const endpoint = '/beta-2/deliveries'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { carrier }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
    })

    it('rejects delivery recording with non-existent movement', async () => {
      const endpoint = '/beta-2/deliveries'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { movementIds: ['NONEXISTENT'], carrier }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })

    it('rejects receipt recording without a carrier', async () => {
      const endpoint = '/beta-2/receipts'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'NotProvided',
          pointer: '/carrier'
        })
      )
    })

    it('rejects receipt recording without a carrier', async () => {
      const endpoint = '/beta-2/receipts'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
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
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'NotProvided',
          pointer: '/carrier'
        })
      )
    })

    // apiCode is sent in the x-api-code header and resolved by the
    // external API, so the backend rejects it in the body.
    it('rejects receipt recording with apiCode in the body', async () => {
      const endpoint = '/beta-2/receipts'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { apiCode: apiCode1, reason: 'Some reason', carrier }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
    })

    // apiCode is sent in the x-api-code header and resolved by the
    // external API, so the backend rejects it in the body.
    it('rejects apiCode in the movement body', async () => {
      const endpoint = '/beta-2/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          apiCode: apiCode1,
          producer: { wasteSource: 'Household' },
          intendedCarriers
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })

    // Scenario: A Movement isn't created when no intended carrier is declared.
    it('rejects a movement without intended carriers', async () => {
      const endpoint = '/beta-2/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { producer: { wasteSource: 'Household' } }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint,
        shape: 'VALIDATION-ERROR'
      })
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          errorType: 'NotProvided',
          pointer: '/intendedCarriers'
        })
      )
    })

    it('rejects invalid producer wasteSource', async () => {
      const endpoint = '/beta-2/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          intendedCarriers,
          producer: { wasteSource: 'Invalid' }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })

    it('reports a producer of the wrong type once', async () => {
      const endpoint = '/beta-2/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: { producer: 'fail' }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
      expect(response.body.errors).toEqual([
        {
          errorType: 'InvalidType',
          message: 'must be object',
          pointer: '/producer'
        }
      ])
    })

    it('rejects commercial producer missing organisationName', async () => {
      const endpoint = '/beta-2/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          intendedCarriers,
          producer: {
            wasteSource: 'Commercial',
            sicCode: '38110',
            authorisationNumber: 'EAS/P/123456',
            address: { fullAddress: 'Test', postcode: 'TE1 2PQ' },
            emailAddress: 'test@example.com'
          }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })

    it('rejects commercial producer with invalid sicCode format', async () => {
      const endpoint = '/beta-2/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          intendedCarriers,
          producer: {
            wasteSource: 'Commercial',
            organisationName: 'Test Org',
            sicCode: '123',
            authorisationNumber: 'EAS/P/123456',
            address: { fullAddress: 'Test', postcode: 'TE1 2PQ' },
            emailAddress: 'test@example.com'
          }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })

    it('rejects commercial producer missing both email and phone', async () => {
      const endpoint = '/beta-2/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          intendedCarriers,
          producer: {
            wasteSource: 'Commercial',
            organisationName: 'Test Org',
            sicCode: '38110',
            authorisationNumber: 'EAS/P/123456',
            address: { fullAddress: 'Test', postcode: 'TE1 2PQ' }
          }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })

    it('rejects commercial producer missing authorisation details', async () => {
      const endpoint = '/beta-2/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          intendedCarriers,
          producer: {
            wasteSource: 'Commercial',
            organisationName: 'Test Org',
            sicCode: '38110',
            address: { fullAddress: 'Test', postcode: 'TE1 2PQ' },
            emailAddress: 'test@example.com'
          }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })

    it('rejects commercial producer with invalid postcode', async () => {
      const endpoint = '/beta-2/movements'
      const response = await betaHttpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          intendedCarriers,
          producer: {
            wasteSource: 'Commercial',
            organisationName: 'Test Org',
            sicCode: '38110',
            authorisationNumber: 'EAS/P/123456',
            address: { fullAddress: 'Test', postcode: 'INVALID' },
            emailAddress: 'test@example.com'
          }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })
  })

  describe('producer payload variants', () => {
    it('household producer with minimal fields', async () => {
      const { status, body } = await betaHttpRequest(
        testService.baseUrl,
        '/beta-2/movements',
        {
          method: 'POST',
          body: {
            intendedCarriers,
            producer: { wasteSource: 'Household' }
          }
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expect(body.data).toHaveProperty('movementId')
    })

    it('municipal producer with full details', async () => {
      const { status, body } = await betaHttpRequest(
        testService.baseUrl,
        '/beta-2/movements',
        {
          method: 'POST',
          body: {
            intendedCarriers,
            producer: {
              wasteSource: 'Municipal',
              organisationName: 'Test Council',
              address: { fullAddress: 'Council Office', postcode: 'TE1 3ST' },
              contactDetails: { phoneNumber: '01234567890' },
              authorisationNumber: 'EAS/P/123456'
            }
          }
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
      expect(body.data).toHaveProperty('movementId')
    })

    it('commercial producer with reasonForNoAuthorisationNumber', async () => {
      const { status, body } = await betaHttpRequest(
        testService.baseUrl,
        '/beta-2/movements',
        {
          method: 'POST',
          body: {
            intendedCarriers,
            producer: {
              wasteSource: 'Commercial',
              organisationName: 'Test Company',
              sicCode: '38110',
              address: { fullAddress: '123 Test St', postcode: 'TE1 2PQ' },
              reasonForNoAuthorisationNumber: 'Exempt operation',
              contactDetails: { emailAddress: 'nobody@gmail.com' }
            }
          }
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
      expect(body.data).toHaveProperty('movementId')
    })
  })
})
