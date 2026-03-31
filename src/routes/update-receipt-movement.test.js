import hapi from '@hapi/hapi'
import { updateReceiptMovement } from './update-receipt-movement.js'
import { createReceiptMovement } from './create-receipt-movement.js'
import { requestLogger } from '../common/helpers/logging/request-logger.js'
import { mongoDb } from '../common/helpers/mongodb.js'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'
import { expect } from '@jest/globals'
import { config } from '../config.js'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import * as movementUpdate from '../services/movement-update.js'
import { requestTracing } from '../common/helpers/request-tracing.js'
import { createTestPayload } from '../schemas/test-helpers/waste-test-helpers.js'

jest.mock('../services/movement-update.js', () => {
  const { updateWasteInput: actualFunction } = jest.requireActual(
    '../services/movement-update.js'
  )
  return { updateWasteInput: jest.fn(actualFunction) }
})

jest.mock('../common/constants/exponential-backoff.js', () => ({
  BACKOFF_OPTIONS: {
    numOfAttempts: 3,
    startingDelay: 1
  }
}))

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockReturnValue(true)
}))

const orgId1 = '57aed195-325e-45d5-b1fb-5f201e0324cf'

describe('movementUpdate Route Tests', () => {
  let server
  let mongoClient
  let testMongoDb
  let replicaSet
  let mongoUri

  const errorMessage = 'Database connection failed'
  const traceId = 'updated-trace-id-123'

  beforeAll(async () => {
    const testMongo = await createTestMongoDb(true)
    mongoClient = testMongo.client
    testMongoDb = testMongo.db
    mongoUri = testMongo.mongoUri
    replicaSet = testMongo.replicaSet

    config.set('mongo.uri', mongoUri)
    config.set('mongo.readPreference', 'primary')

    server = hapi.server()
    server.route(createReceiptMovement)
    server.route(updateReceiptMovement)
    await server.register([requestLogger, mongoDb, requestTracing])
    await server.initialize()
  })

  afterAll(async () => {
    if (replicaSet) {
      await replicaSet.stop()
    }
    await server.stop()
    await mongoClient.close()
  })

  it('updates a waste input', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const payload = {
      movement: createTestPayload()
    }

    const createResult = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      headers: { 'x-cdp-request-id': traceId },
      payload
    })

    expect(createResult.statusCode).toEqual(204)
    expect(createResult.result).toEqual(null)

    const beforeUpdate = await testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })
    const timestampBeforeUpdate = beforeUpdate.lastUpdatedAt

    const updateWasteInputSpy = jest.spyOn(movementUpdate, 'updateWasteInput')

    movementUpdate.updateWasteInput
      .mockImplementationOnce(() => {
        throw new Error(errorMessage)
      })
      .mockImplementationOnce(() => {
        throw new Error(errorMessage)
      })

    await updateReceipt(wasteTrackingId, payload, traceId)

    const actualWasteInput = await testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })
    expect(actualWasteInput.wasteTrackingId).toEqual(wasteTrackingId)
    expect(actualWasteInput.revision).toEqual(2)
    expect(actualWasteInput.createdAt).toBeInstanceOf(Date)
    expect(actualWasteInput.lastUpdatedAt).toBeInstanceOf(Date)
    expect(actualWasteInput.lastUpdatedAt.getTime()).toBeGreaterThan(
      timestampBeforeUpdate.getTime()
    )
    expect(actualWasteInput.traceId).toEqual(traceId)

    const historicState = await getHistoricState(wasteTrackingId).toArray()
    expect(historicState.length).toEqual(1)
    expect(historicState[0]._id).toBeDefined()
    expect(historicState[0].wasteTrackingId).toEqual(wasteTrackingId)
    expect(historicState[0].revision).toEqual(1)

    expect(updateWasteInputSpy).toHaveBeenCalledTimes(3)
  })

  async function getCurrentWasteInput(wasteTrackingId) {
    return testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })
  }

  it('updates a waste input twice and stores all history', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const payload = {
      movement: createTestPayload()
    }

    const createResult = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      headers: { 'x-cdp-request-id': traceId },
      payload
    })

    expect(createResult.statusCode).toEqual(204)
    expect(createResult.result).toEqual(null)

    await updateReceipt(wasteTrackingId, payload, traceId)

    const afterFirstUpdate = await getCurrentWasteInput(wasteTrackingId)
    const timestampAfterFirstUpdate = afterFirstUpdate.lastUpdatedAt
    const traceIdUpdate2 = 'trace-id-update-2'
    await updateReceipt(wasteTrackingId, payload, traceIdUpdate2)

    const actualWasteInput = await getCurrentWasteInput(wasteTrackingId)
    expect(actualWasteInput.wasteTrackingId).toEqual(wasteTrackingId)
    expect(actualWasteInput.revision).toEqual(3)
    expect(actualWasteInput.createdAt).toBeInstanceOf(Date)
    expect(actualWasteInput.lastUpdatedAt).toBeInstanceOf(Date)
    expect(actualWasteInput.lastUpdatedAt.getTime()).toBeGreaterThan(
      timestampAfterFirstUpdate.getTime()
    )
    expect(actualWasteInput.traceId).toEqual(traceIdUpdate2)

    const historicState = await getHistoricState(wasteTrackingId).toArray()

    expect(historicState.length).toEqual(2)
    expect(historicState[0]._id).toBeDefined()
    expect(historicState[0].wasteTrackingId).toEqual(wasteTrackingId)
    expect(historicState[0].revision).toEqual(1)
    expect(historicState[1]._id).toBeDefined()
    expect(historicState[1].wasteTrackingId).toEqual(wasteTrackingId)
    expect(historicState[1].revision).toEqual(2)
  })

  it('returns 404 when updating a non-existent waste input', async () => {
    const wasteTrackingId = 'nonexistent-id'
    const updatePayload = {
      movement: createTestPayload()
    }

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive`,
      headers: { 'x-cdp-request-id': traceId },
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

  async function updateReceipt(wasteTrackingId, updatePayload, traceId) {
    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: updatePayload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(200)
    expect(result).toEqual(null)
  }

  function getHistoricState(wasteTrackingId) {
    return testMongoDb
      .collection('waste-inputs-history')
      .find({ wasteTrackingId })
  }

  it('rejects when the submitting organisation does not match the original record', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const createPayload = {
      movement: createTestPayload()
    }

    const createResult = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      headers: { 'x-cdp-request-id': traceId },
      payload: createPayload
    })

    expect(createResult.statusCode).toEqual(204)
    expect(createResult.result).toEqual(null)

    const updatePayload = {
      movement: createTestPayload({
        submittingOrganisation: {
          defraCustomerOrganisationId: 'different-org-id'
        }
      })
    }

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive`,
      headers: { 'x-cdp-request-id': traceId },
      payload: updatePayload
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.BAD_REQUEST)
    expect(result).toEqual({
      validation: {
        errors: [
          {
            key: 'submittingOrganisation',
            errorType: 'BusinessRuleViolation',
            message:
              'the submitting organisation does not match the Organisation that created the original waste item record'
          }
        ]
      }
    })
  })

  it('returns 404 when submittingOrganisation is provided but waste input does not exist', async () => {
    const updatePayload = {
      movement: createTestPayload({
        submittingOrganisation: {
          defraCustomerOrganisationId: 'some-org-id'
        }
      })
    }

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/nonexistent-id/receive`,
      headers: { 'x-cdp-request-id': traceId },
      payload: updatePayload
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.NOT_FOUND)
    expect(result).toEqual({
      statusCode: HTTP_STATUS_CODES.NOT_FOUND,
      error: 'Not Found',
      message: 'Waste input with ID nonexistent-id not found'
    })
  })

  it('updates a waste input with matching submittingOrganisation', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const payload = {
      movement: createTestPayload()
    }

    const createResult = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      headers: { 'x-cdp-request-id': traceId },
      payload
    })

    expect(createResult.statusCode).toEqual(204)

    const { statusCode } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive`,
      headers: { 'x-cdp-request-id': traceId },
      payload
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.OK)

    const actualWasteInput = await testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })

    expect(actualWasteInput.submittingOrganisation).toEqual({
      defraCustomerOrganisationId: orgId1
    })
    expect(actualWasteInput.receipt.movement.dateTimeReceived).toEqual(
      payload.movement.dateTimeReceived
    )
  })

  it('rejects when Mongo throws a schema validation error', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const createPayload = {
      movement: createTestPayload()
    }

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: createPayload
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.BAD_REQUEST)
    expect(result).toEqual({
      statusCode: HTTP_STATUS_CODES.BAD_REQUEST,
      error: 'ValidationError',
      message:
        '[{"operatorName":"properties","propertiesNotSatisfied":[{"propertyName":"traceId","details":[{"operatorName":"bsonType","specifiedAs":{"bsonType":"string"},"reason":"type did not match","consideredValue":null,"consideredType":"null"}]}]}]'
    })
  })

  it('handles error when updating a waste input fails', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const payload = {
      movement: createTestPayload()
    }

    const createResult = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      headers: { 'x-cdp-request-id': traceId },
      payload
    })

    expect(createResult.statusCode).toEqual(204)

    const updateWasteInputSpy = jest.spyOn(movementUpdate, 'updateWasteInput')

    movementUpdate.updateWasteInput.mockRejectedValue(new Error(errorMessage))

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive`,
      headers: { 'x-cdp-request-id': traceId },
      payload
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      statusCode: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      error: 'Error',
      message: errorMessage
    })
    expect(updateWasteInputSpy).toHaveBeenCalledTimes(3)
  })
})
