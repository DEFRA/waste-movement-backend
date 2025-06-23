import hapi from '@hapi/hapi'
import { createReceiptMovement } from './create-receipt-movement.js'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import { mongoDb } from '../common/helpers/mongodb.js'
import { requestLogger } from '../common/helpers/logging/request-logger.js'
import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'

describe('movement Route Tests', () => {
  let server
  let mongoClient
  let testMongoDb

  beforeAll(async () => {
    server = hapi.server()
    server.route(createReceiptMovement)
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

  it('creates a waste input', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const expectedPayload = {
      movement: {
        receivingSiteId: 'string',
        receiverReference: 'string',
        specialHandlingRequirements: 'string'
      }
    }

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: expectedPayload
    })

    expect(statusCode).toEqual(204)
    expect(result).toEqual(null)

    const actualWasteInput = await testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })

    expect(actualWasteInput.wasteTrackingId).toEqual(wasteTrackingId)
    expect(actualWasteInput.receipt).toEqual(expectedPayload)
  })
})
