import { expect, describe, beforeAll, afterAll, it } from '@jest/globals'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { startTestService } from './helpers/test-service.js'
import { createWasteTrackingStub } from './helpers/waste-tracking-stub.js'
import { httpRequest } from './helpers/http.js'
import { expectStandardHeaders } from './helpers/expect-standard-headers.js'
import { describeBetaEndpointTests } from './helpers/beta-endpoint-tests.js'
import { apiCode1 } from '../../src/test/data/apiCodes.js'
import { ObjectId } from 'mongodb'

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
      minimalProducer: minimalHouseholdProducer,
      requiresProducer: true
    }
  )

  describe('POST /beta-2/movements', () => {
    it('creates a movement with minimal payload', async () => {
      const producer = { wasteSource: 'Household', councilMovement: false }
      const res = await httpRequest(testService.baseUrl, '/beta-2/movements', {
        method: 'POST',
        body: { apiCode: apiCode1, producer }
      })

      expect(res.status).toEqual(HTTP_STATUS.CREATED)
      expect(res.body).toEqual({
        data: { movementId: expect.any(String) },
        validation: { warnings: [] }
      })
      expectStandardHeaders(res)

      const { movementId } = res.body.data
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
      const res = await httpRequest(testService.baseUrl, '/beta-2/movements', {
        method: 'POST',
        body: { apiCode: apiCode1, producer }
      })

      expect(res.status).toEqual(HTTP_STATUS.CREATED)
      expect(res.body.data).toHaveProperty('movementId')
      expect(res.body.validation).toEqual({ warnings: [] })
      expectStandardHeaders(res)

      const { movementId } = res.body.data
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
        emailAddress: 'contact@acme.com',
        councilMovement: false
      }
      const res = await httpRequest(testService.baseUrl, '/beta-2/movements', {
        method: 'POST',
        body: { apiCode: apiCode1, producer }
      })

      expect(res.status).toEqual(HTTP_STATUS.CREATED)
      expect(res.body.data).toHaveProperty('movementId')
      expect(res.body.validation).toEqual({ warnings: [] })
      expectStandardHeaders(res)

      const { movementId } = res.body.data
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
      const res = await httpRequest(testService.baseUrl, '/beta-2/movements', {
        method: 'POST',
        body: { producer: { wasteSource: 'Household', councilMovement: false } }
      })

      expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(res.body).toHaveProperty('title')
      expect(res.body.title).toContain('Bad Request')
    })

    it('rejects invalid producer wasteSource', async () => {
      const res = await httpRequest(testService.baseUrl, '/beta-2/movements', {
        method: 'POST',
        body: {
          apiCode: apiCode1,
          producer: { wasteSource: 'Invalid', councilMovement: false }
        }
      })

      expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(res.body).toHaveProperty('title')
      expect(res.body.title).toContain('Bad Request')
    })

    it('rejects commercial producer missing organisationName', async () => {
      const res = await httpRequest(testService.baseUrl, '/beta-2/movements', {
        method: 'POST',
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

      expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(res.body).toHaveProperty('title')
      expect(res.body.title).toContain('Bad Request')
    })

    it('rejects commercial producer with invalid sicCode format', async () => {
      const res = await httpRequest(testService.baseUrl, '/beta-2/movements', {
        method: 'POST',
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

      expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(res.body).toHaveProperty('title')
      expect(res.body.title).toContain('Bad Request')
    })

    it('rejects commercial producer missing both email and phone', async () => {
      const res = await httpRequest(testService.baseUrl, '/beta-2/movements', {
        method: 'POST',
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

      expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(res.body).toHaveProperty('title')
      expect(res.body.title).toContain('Bad Request')
    })

    it('rejects commercial producer missing authorisation details', async () => {
      const res = await httpRequest(testService.baseUrl, '/beta-2/movements', {
        method: 'POST',
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

      expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(res.body).toHaveProperty('title')
      expect(res.body.title).toContain('Bad Request')
    })

    it('rejects commercial producer with invalid postcode', async () => {
      const res = await httpRequest(testService.baseUrl, '/beta-2/movements', {
        method: 'POST',
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

      expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(res.body).toHaveProperty('title')
      expect(res.body.title).toContain('Bad Request')
    })
  })

  describe('producer payload variants', () => {
    it('household producer with minimal fields', async () => {
      const res = await httpRequest(testService.baseUrl, '/beta-2/movements', {
        method: 'POST',
        body: {
          apiCode: apiCode1,
          producer: { wasteSource: 'Household', councilMovement: true }
        }
      })

      expect(res.status).toEqual(HTTP_STATUS.CREATED)
      expect(res.body.data).toHaveProperty('movementId')
    })

    it('municipal producer with full details', async () => {
      const res = await httpRequest(testService.baseUrl, '/beta-2/movements', {
        method: 'POST',
        body: {
          apiCode: apiCode1,
          producer: {
            wasteSource: 'Municipal',
            organisationName: 'Test Council',
            address: { fullAddress: 'Council Office', postcode: 'TE1 3ST' },
            phoneNumber: '01234567890',
            authorisationNumber: 'EAS/P/123456',
            councilMovement: true
          }
        }
      })

      expect(res.status).toEqual(HTTP_STATUS.CREATED)
      expect(res.body.data).toHaveProperty('movementId')
    })

    it('commercial producer with reasonForNoAuthorisationNumber', async () => {
      const res = await httpRequest(testService.baseUrl, '/beta-2/movements', {
        method: 'POST',
        body: {
          apiCode: apiCode1,
          producer: {
            wasteSource: 'Commercial',
            organisationName: 'Test Company',
            sicCode: '38110',
            address: { fullAddress: '123 Test St', postcode: 'TE1 2PQ' },
            phoneNumber: '01234567890',
            reasonForNoAuthorisationNumber: 'Exempt operation',
            councilMovement: false
          }
        }
      })

      expect(res.status).toEqual(HTTP_STATUS.CREATED)
      expect(res.body.data).toHaveProperty('movementId')
    })
  })
})
