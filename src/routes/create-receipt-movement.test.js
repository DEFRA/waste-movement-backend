import {
  expect,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  it,
  jest
} from '@jest/globals'
import hapi from '@hapi/hapi'
import { createReceiptMovement } from './create-receipt-movement.js'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import { mongoDb } from '../common/helpers/mongodb.js'
import { requestLogger } from '../common/helpers/logging/request-logger.js'
import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { createWasteInput } from '../services/movement-create.js'

jest.mock('../services/movement-create.js', () => {
  const { createWasteInput: actualFunction } = jest.requireActual(
    '../services/movement-create.js'
  )
  return { createWasteInput: jest.fn(actualFunction) }
})

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
    expect(actualWasteInput.revision).toEqual(1)
    expect(actualWasteInput.receipt).toEqual(expectedPayload)
  })

  it('handles error when creating a waste input fails', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const payload = {
      movement: {
        receivingSiteId: 'string',
        receiverReference: 'string',
        specialHandlingRequirements: 'string'
      }
    }

    const errorMessage = 'Database connection failed'

    createWasteInput.mockRejectedValueOnce(new Error(errorMessage))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      statusCode: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      error: 'Unexpected error',
      message: errorMessage
    })
  })
})
