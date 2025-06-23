import {
  expect,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  it
} from '@jest/globals'
import hapi from '@hapi/hapi'
import { updateHazardousWaste } from './update-hazardous-waste.js'
import { mongoDb } from '../common/helpers/mongodb.js'
import { requestLogger } from '../common/helpers/logging/request-logger.js'
import { createReceiptMovement } from './create-receipt-movement.js'
import { createMovementPostBody } from '../test/create-movement-post-body.js'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'

describe('updateHazardousWaste Route Tests', () => {
  let server
  let mongoClient
  let testMongoDb

  beforeAll(async () => {
    server = hapi.server()
    server.route(createReceiptMovement)
    server.route(updateHazardousWaste)
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

  it('updates hazardous waste details', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const updatePayload = {
      hazardousWaste: {
        // Sample hazardous waste data
        hazardCode: 'H3-A',
        components: [
          {
            name: 'Toxic substance',
            concentration: '10%'
          }
        ],
        physicalForm: 'Liquid',
        handlingInstructions: 'Handle with care'
      }
    }

    const createResult = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: createMovementPostBody()
    })

    expect(createResult.statusCode).toEqual(204)
    expect(createResult.result).toEqual(null)

    const updateResult = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive/hazardous`,
      payload: updatePayload
    })

    expect(updateResult.statusCode).toEqual(200)
    expect(updateResult.result).toEqual(null)

    const movementUpdated = await testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })
    console.log(movementUpdated)
    console.log(updateResult.payload)
    expect(movementUpdated.receipt.hazardousWaste).toEqual(updatePayload)
  })

  it('returns 404 when updating hazardous waste for a non-existent waste input', async () => {
    const wasteTrackingId = 'nonexistent-id'
    const updatePayload = {
      hazardousWaste: {
        // Sample hazardous waste data
        hazardCode: 'H3-A',
        components: [
          {
            name: 'Toxic substance',
            concentration: '10%'
          }
        ],
        physicalForm: 'Liquid',
        handlingInstructions: 'Handle with care'
      }
    }

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive/hazardous`,
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
