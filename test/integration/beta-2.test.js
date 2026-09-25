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

describe('beta-2', () => {
  let testService
  let wasteTrackingStub
  const version = 'beta-2'
  const minimalHouseholdProducer = {
    producer: { wasteSource: 'Household', councilMovement: false }
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

  // Shared error formatting and RFC9457 compliance tests
  describeBetaEndpointTests(version, () => testService, {
    apiCode1,
    minimalProducer: minimalHouseholdProducer,
    requiresProducer: true
  })

  describe('POST /beta-2/movements', () => {
    it('creates a movement with minimal payload', async () => {
      const producer = { wasteSource: 'Household', councilMovement: false }
      const { status, body, headers } = await httpRequest(
        testService.baseUrl,
        '/beta-2/movements',
        {
          method: 'POST',
          body: { apiCode: apiCode1, producer }
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
        orgId: expect.any(String),
        createdAt: expect.any(String)
      })
    })

    it('creates a movement with producer payload', async () => {
      const producer = { wasteSource: 'Household', councilMovement: false }
      const { status, body, headers } = await httpRequest(
        testService.baseUrl,
        '/beta-2/movements',
        {
          method: 'POST',
          body: { apiCode: apiCode1, producer }
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
        orgId: expect.any(String),
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
        },
        councilMovement: false
      }
      const { status, body, headers } = await httpRequest(
        testService.baseUrl,
        '/beta-2/movements',
        {
          method: 'POST',
          body: { apiCode: apiCode1, producer }
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
        orgId: expect.any(String),
        createdAt: expect.any(String)
      })
    })
  })

  describe('beta-2 specific error cases', () => {
    it('rejects missing required field apiCode', async () => {
      const endpoint = '/beta-2/movements'
      const response = await httpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          producer: { wasteSource: 'Household', councilMovement: false }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })

    it('rejects invalid producer wasteSource', async () => {
      const endpoint = '/beta-2/movements'
      const response = await httpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          apiCode: apiCode1,
          producer: { wasteSource: 'Invalid', councilMovement: false }
        }
      })

      expectProblemResponse(response, {
        status: HTTP_STATUS.BAD_REQUEST,
        type: 'bad-request',
        instance: endpoint
      })
    })

    it('rejects commercial producer missing organisationName', async () => {
      const endpoint = '/beta-2/movements'
      const response = await httpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          apiCode: apiCode1,
          producer: {
            wasteSource: 'Commercial',
            sicCode: '38110',
            authorisationNumber: 'EAS/P/123456',
            address: { fullAddress: 'Test', postcode: 'TE1 2PQ' },
            emailAddress: 'test@example.com',
            councilMovement: false
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
      const response = await httpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          apiCode: apiCode1,
          producer: {
            wasteSource: 'Commercial',
            organisationName: 'Test Org',
            sicCode: '123',
            authorisationNumber: 'EAS/P/123456',
            address: { fullAddress: 'Test', postcode: 'TE1 2PQ' },
            emailAddress: 'test@example.com',
            councilMovement: false
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
      const response = await httpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          apiCode: apiCode1,
          producer: {
            wasteSource: 'Commercial',
            organisationName: 'Test Org',
            sicCode: '38110',
            authorisationNumber: 'EAS/P/123456',
            address: { fullAddress: 'Test', postcode: 'TE1 2PQ' },
            councilMovement: false
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
      const response = await httpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          apiCode: apiCode1,
          producer: {
            wasteSource: 'Commercial',
            organisationName: 'Test Org',
            sicCode: '38110',
            address: { fullAddress: 'Test', postcode: 'TE1 2PQ' },
            emailAddress: 'test@example.com',
            councilMovement: false
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
      const response = await httpRequest(testService.baseUrl, endpoint, {
        method: 'POST',
        requestId: randomUUID(),
        body: {
          apiCode: apiCode1,
          producer: {
            wasteSource: 'Commercial',
            organisationName: 'Test Org',
            sicCode: '38110',
            authorisationNumber: 'EAS/P/123456',
            address: { fullAddress: 'Test', postcode: 'INVALID' },
            emailAddress: 'test@example.com',
            councilMovement: false
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
      const { status, body } = await httpRequest(
        testService.baseUrl,
        '/beta-2/movements',
        {
          method: 'POST',
          body: {
            apiCode: apiCode1,
            producer: { wasteSource: 'Household', councilMovement: true }
          }
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expect(body.data).toHaveProperty('movementId')
    })

    it('municipal producer with full details', async () => {
      const { status, body } = await httpRequest(
        testService.baseUrl,
        '/beta-2/movements',
        {
          method: 'POST',
          body: {
            apiCode: apiCode1,
            producer: {
              wasteSource: 'Municipal',
              organisationName: 'Test Council',
              address: { fullAddress: 'Council Office', postcode: 'TE1 3ST' },
              contactDetails: { phoneNumber: '01234567890' },
              authorisationNumber: 'EAS/P/123456',
              councilMovement: true
            }
          }
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectResponseBodyHasCorrectShape({ body, shape: 'SUCCESS' })
      expect(body.data).toHaveProperty('movementId')
    })

    it('commercial producer with reasonForNoAuthorisationNumber', async () => {
      const { status, body } = await httpRequest(
        testService.baseUrl,
        '/beta-2/movements',
        {
          method: 'POST',
          body: {
            apiCode: apiCode1,
            producer: {
              wasteSource: 'Commercial',
              organisationName: 'Test Company',
              sicCode: '38110',
              address: { fullAddress: '123 Test St', postcode: 'TE1 2PQ' },
              reasonForNoAuthorisationNumber: 'Exempt operation',
              councilMovement: false,
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
