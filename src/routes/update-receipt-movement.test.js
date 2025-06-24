import hapi from '@hapi/hapi'
import { updateReceiptMovement } from './update-receipt-movement.js'
import { createReceiptMovement } from './create-receipt-movement.js'
import { requestLogger } from '../common/helpers/logging/request-logger.js'
import { mongoDb } from '../common/helpers/mongodb.js'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'
import { expect } from '@jest/globals'

describe('movementUpdate Route Tests', () => {
  let server
  let mongoClient
  let testMongoDb

  beforeAll(async () => {
    server = hapi.server()
    server.route(createReceiptMovement)
    server.route(updateReceiptMovement)
    await server.register([requestLogger, mongoDb])
    await server.initialize()
    const testMongo = await createTestMongoDb()
    mongoClient = testMongo.client
    testMongoDb = testMongo.db
  })

  afterAll(async () => {
    await server.stop()
    await mongoClient.close()
  })

  beforeEach(async () => {})

  it('updates a waste input', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const createPayload = {
      movement: {
        receivingSiteId: 'test',
        receiverReference: 'test',
        specialHandlingRequirements: 'test'
      }
    }

    const createResult = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: createPayload
    })

    console.log('!!!!!' + createResult.payload)
    expect(createResult.statusCode).toEqual(204)
    expect(createResult.result).toEqual(null)

    const updatePayload = {
      movement: {
        receivingSiteId: 'updated-site',
        receiverReference: 'updated-ref',
        specialHandlingRequirements: 'updated-requirements'
      }
    }

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: updatePayload
    })

    expect(statusCode).toEqual(200)
    expect(result).toEqual(null)

    const actualWasteInput = await testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })
    expect(actualWasteInput.wasteTrackingId).toEqual(wasteTrackingId)
    expect(actualWasteInput.receipt).toEqual(updatePayload)
  })

  it('returns 404 when updating a non-existent waste input', async () => {
    const wasteTrackingId = 'nonexistent-id'
    const updatePayload = {
      movement: {
        receivingSiteId: 'updated-site',
        receiverReference: 'updated-ref',
        // Minimal payload for test
        carrier: {
          registrationNumber: 'updated-reg',
          organisationName: 'updated-org',
          address: 'updated-address',
          emailAddress: 'updated@email.com',
          phoneNumber: 'updated-phone',
          vehicleRegistration: 'updated-vehicle',
          meansOfTransport: 'Road'
        },
        acceptance: {
          acceptingAll: true
        },
        receiver: {
          authorisationType: 'updated-type',
          authorisationNumber: 'updated-number'
        },
        receipt: {
          estimateOrActual: 'Actual',
          dateTimeReceived: new Date(2025, 6, 15)
        }
      }
    }

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: updatePayload
    })

    expect(statusCode).toEqual(404)
    expect(result).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: `Waste input with ID ${wasteTrackingId} not found`
    })

    const actualWasteInput = await testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })

    expect(actualWasteInput).toEqual(null)
  })
})
