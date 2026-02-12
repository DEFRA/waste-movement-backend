import { expect, describe, beforeAll, afterAll, it, jest } from '@jest/globals'
import hapi from '@hapi/hapi'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import { mongoDb } from '../common/helpers/mongodb.js'
import { requestLogger } from '../common/helpers/logging/request-logger.js'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import * as movementCreateBulk from '../services/movement-create-bulk.js'
import { config } from '../config.js'
import { requestTracing } from '../common/helpers/request-tracing.js'
import { createBulkReceiptMovement } from './create-bulk-receipt-movement.js'
import { orgId1 } from '../test/data/apiCodes.js'
import { BULK_RESPONSE_STATUS } from '../common/constants/bulk-response-status.js'
import { createBulkMovementRequest } from '../test/utils/createBulkMovementRequest.js'
import * as batch from '../common/helpers/batch.js'

const payload = [createBulkMovementRequest(), createBulkMovementRequest()]

jest.mock('../common/constants/exponential-backoff.js', () => ({
  BACKOFF_OPTIONS: {
    numOfAttempts: 3,
    startingDelay: 1
  }
}))

jest.mock('../common/helpers/http-client.js', () => ({
  httpClients: {
    wasteTracking: {
      get: jest
        .fn()
        .mockResolvedValueOnce({ payload: { wasteTrackingId: '26S8EYDJ' } })
        .mockResolvedValueOnce({ payload: { wasteTrackingId: '26NWSIXF' } })
        .mockResolvedValueOnce({ payload: { wasteTrackingId: '26S8EYDJ' } })
        .mockResolvedValueOnce({ payload: { wasteTrackingId: '26NWSIXF' } })
        .mockResolvedValueOnce({ payload: { wasteTrackingId: '26S8EYDJ' } })
        .mockResolvedValueOnce({ payload: { wasteTrackingId: '26NWSIXF' } })
        .mockResolvedValueOnce({ payload: { wasteTrackingId: '26S8EYDJ' } })
        .mockResolvedValueOnce({ payload: { wasteTrackingId: '26NWSIXF' } })
    }
  }
}))

describe('Create Bulk Receipt Movement Route Tests', () => {
  let server
  let mongoClient
  let testMongoDb
  let replicaSet
  let mongoUri
  let wasteInputsCollection
  let wasteInputsHistoryCollection

  const errorMessage = 'Database connection failed'
  const traceId = 'created-trace-id-123'
  const bulkId = 'fccbd30d-3082-494d-b470-15b13a7bbaa8'
  const wasteInputs = [
    {
      wasteTrackingId: '26E4C7Z2',
      receipt: {},
      createdAt: new Date(),
      lastUpdatedAt: new Date(),
      orgId: orgId1,
      traceId,
      bulkId
    },
    {
      wasteTrackingId: '266XHTDL',
      receipt: {},
      createdAt: new Date(),
      lastUpdatedAt: new Date(),
      orgId: orgId1,
      traceId,
      bulkId
    }
  ]

  beforeAll(async () => {
    const testMongo = await createTestMongoDb(true)
    mongoClient = testMongo.client
    testMongoDb = testMongo.db
    mongoUri = testMongo.mongoUri
    replicaSet = testMongo.replicaSet

    config.set('mongo.uri', mongoUri)
    config.set('mongo.readPreference', 'primary')

    server = hapi.server()
    server.route(createBulkReceiptMovement)
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

  beforeEach(async () => {
    wasteInputsCollection = testMongoDb.collection('waste-inputs')
    wasteInputsHistoryCollection = testMongoDb.collection(
      'waste-inputs-history'
    )

    await wasteInputsCollection.deleteMany({})
    await wasteInputsHistoryCollection.deleteMany({})
  })

  it('creates multiple waste inputs', async () => {
    const createBulkWasteInputSpy = jest.spyOn(
      movementCreateBulk,
      'createBulkWasteInput'
    )

    movementCreateBulk.createBulkWasteInput
      .mockImplementationOnce(() => {
        throw new Error(errorMessage)
      })
      .mockImplementationOnce(() => {
        throw new Error(errorMessage)
      })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.CREATED)
    expect(result).toEqual({
      status: BULK_RESPONSE_STATUS.MOVEMENTS_CREATED,
      movements: [
        { wasteTrackingId: '26S8EYDJ' },
        { wasteTrackingId: '26NWSIXF' }
      ]
    })

    for (const [index, item] of result.movements.entries()) {
      const createdWasteInput = await testMongoDb
        .collection('waste-inputs')
        .findOne({ _id: item.wasteTrackingId })

      expect(createdWasteInput.wasteTrackingId).toEqual(item.wasteTrackingId)
      expect(createdWasteInput.revision).toEqual(1)
      expect(createdWasteInput.receipt).toEqual(payload[index])
      expect(createdWasteInput.createdAt).toBeInstanceOf(Date)
      expect(createdWasteInput.lastUpdatedAt).toBeInstanceOf(Date)
      expect(createdWasteInput.createdAt).toEqual(
        createdWasteInput.lastUpdatedAt
      )
      expect(createdWasteInput.orgId).toEqual(payload[index].orgId)
      expect(createdWasteInput.traceId).toEqual(traceId)
    }

    expect(createBulkWasteInputSpy).toHaveBeenCalledTimes(3)
  })

  it('should return existing waste tracking ids when provided with a bulk id which has already been used by the POST endpoint in the waste-inputs collection', async () => {
    wasteInputs[0].revision = 1
    wasteInputs[1].revision = 1

    await wasteInputsCollection.insertMany(wasteInputs)

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.OK)
    expect(result).toEqual({
      status: BULK_RESPONSE_STATUS.MOVEMENTS_NOT_CREATED,
      movements: [
        { wasteTrackingId: '26E4C7Z2' },
        { wasteTrackingId: '266XHTDL' }
      ]
    })
  })

  it('should return existing waste tracking ids when provided with a bulk id which has already been used by the POST endpoint in the waste-inputs-history collection', async () => {
    wasteInputs[0].revision = 1
    wasteInputs[1].revision = 1

    await wasteInputsHistoryCollection.insertMany(wasteInputs)

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.OK)
    expect(result).toEqual({
      status: BULK_RESPONSE_STATUS.MOVEMENTS_NOT_CREATED,
      movements: [
        { wasteTrackingId: '26E4C7Z2' },
        { wasteTrackingId: '266XHTDL' }
      ]
    })
  })

  it('should create new waste inputs when provided with a bulk id which has already been used by the PUT endpoint in the waste-inputs collection', async () => {
    wasteInputs[0].revision = 2
    wasteInputs[1].revision = 2

    await wasteInputsCollection.insertMany(wasteInputs)

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.CREATED)
    expect(result).toEqual({
      status: BULK_RESPONSE_STATUS.MOVEMENTS_CREATED,
      movements: [
        { wasteTrackingId: '26S8EYDJ' },
        { wasteTrackingId: '26NWSIXF' }
      ]
    })
  })

  it('should create new waste inputs when provided with a bulk id which has already been used by the PUT endpoint in the waste-inputs-history collection', async () => {
    wasteInputs[0].revision = 2
    wasteInputs[1].revision = 2

    await wasteInputsHistoryCollection.insertMany(wasteInputs)

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.CREATED)
    expect(result).toEqual({
      status: BULK_RESPONSE_STATUS.MOVEMENTS_CREATED,
      movements: [
        { wasteTrackingId: '26S8EYDJ' },
        { wasteTrackingId: '26NWSIXF' }
      ]
    })
  })

  it('handles error when creating multiple waste inputs fails', async () => {
    const createBulkWasteInputSpy = jest.spyOn(
      movementCreateBulk,
      'createBulkWasteInput'
    )

    movementCreateBulk.createBulkWasteInput.mockRejectedValue(
      new Error(errorMessage)
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      statusCode: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      error: 'Error',
      message: errorMessage
    })

    expect(createBulkWasteInputSpy).toHaveBeenCalledTimes(3)
  })

  it("throws an error when the number of waste tracking ids generated doesn't match the number of movements in the payload", async () => {
    jest.spyOn(batch, 'getBatches').mockReturnValue([])

    const createBulkWasteInputSpy = jest.spyOn(
      movementCreateBulk,
      'createBulkWasteInput'
    )

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      statusCode: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      error: 'Error',
      message:
        "Created wasteTrackingId count (0) doesn't match the request payload count (2) for bulkId (fccbd30d-3082-494d-b470-15b13a7bbaa8)"
    })

    expect(createBulkWasteInputSpy).toHaveBeenCalledTimes(0)
  })
})
