import { expect, describe, beforeAll, afterAll, it, jest } from '@jest/globals'
import hapi from '@hapi/hapi'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import { mongoDb } from '../common/helpers/mongodb.js'
import { requestLogger } from '../common/helpers/logging/request-logger.js'
import { HTTP_STATUS, BULK_RESPONSE_STATUS } from 'waste-movement-utils'
import * as movementCreateBulk from '../services/movement-create-bulk.js'
import { config } from '../config.js'
import { requestTracing } from '../common/helpers/request-tracing.js'
import { createBulkReceiptMovement } from './create-bulk-receipt-movement.js'
import { createBulkMovementRequest } from '../test/utils/createBulkMovementRequest.js'
import * as batch from '../common/helpers/batch.js'
import * as metricsCounter from '../common/helpers/metrics.js'

const assertMetricsCounterWasCalled = (metricsCounterSpy) => {
  expect(metricsCounterSpy).toHaveBeenCalledTimes(4)
  expect(metricsCounterSpy).toHaveBeenNthCalledWith(
    1,
    'receipts.received.bulk',
    1,
    { endpointType: 'post' }
  )
  expect(metricsCounterSpy).toHaveBeenNthCalledWith(
    2,
    'receiver.orgId.bulk',
    1,
    {
      orgId: 'fd98d4ef34e33b34fc8fad03f8c385'
    }
  )
  expect(metricsCounterSpy).toHaveBeenNthCalledWith(
    3,
    'receipts.received.bulk',
    1,
    { endpointType: 'post' }
  )

  expect(metricsCounterSpy).toHaveBeenNthCalledWith(
    4,
    'receiver.orgId.bulk',
    1,
    {
      orgId: 'fd98d4ef34e33b34fc8fad03f8c385'
    }
  )
}

jest.mock('waste-movement-utils', () => {
  const originalModule = jest.requireActual('waste-movement-utils')

  return {
    ...originalModule,
    backoffOptions: () => ({
      numOfAttempts: 3,
      startingDelay: 1
    })
  }
})

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
        .mockResolvedValueOnce({ payload: { wasteTrackingId: '26S8EYDJ' } })
        .mockResolvedValueOnce({ payload: { wasteTrackingId: '26NWSIXF' } })
        .mockResolvedValueOnce({ payload: { wasteTrackingId: '26S8EYDJ' } })
        .mockResolvedValueOnce({ payload: { wasteTrackingId: '26NWSIXF' } })
        .mockResolvedValueOnce({ payload: { wasteTrackingId: '26S8EYDJ' } })
        .mockResolvedValueOnce({ payload: { wasteTrackingId: '26NWSIXF' } })
        .mockResolvedValueOnce({ payload: { wasteTrackingId: '26S8EYDJ' } })
        .mockResolvedValueOnce({ payload: { wasteTrackingId: '26NWSIXF' } })
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

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockImplementation(() => true)
}))

describe('Create Bulk Receipt Movement Route Tests', () => {
  let server
  let mongoClient
  let testMongoDb
  let replicaSet
  let mongoUri
  let wasteInputsCollection
  let wasteInputsHistoryCollection
  let payload

  const errorMessage = 'Database connection failed'
  const traceId = 'created-trace-id-123'
  const bulkId = 'fccbd30d-3082-494d-b470-15b13a7bbaa8'

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

    payload = [createBulkMovementRequest(), createBulkMovementRequest()]
  })

  it('creates multiple waste inputs without warnings', async () => {
    const createBulkWasteInputSpy = jest.spyOn(
      movementCreateBulk,
      'createBulkWasteInput'
    )
    const metricsCounterSpy = jest.spyOn(metricsCounter, 'metricsCounter')

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

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
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
      expect(createdWasteInput.receipt).toEqual({
        movement: {
          ...payload[index],
          submittingOrganisation: undefined
        }
      })
      expect(createdWasteInput.createdAt).toBeInstanceOf(Date)
      expect(createdWasteInput.lastUpdatedAt).toBeInstanceOf(Date)
      expect(createdWasteInput.createdAt).toEqual(
        createdWasteInput.lastUpdatedAt
      )
      expect(createdWasteInput.submittingOrganisation).toEqual(
        payload[index].submittingOrganisation
      )
      expect(createdWasteInput.traceId).toEqual(traceId)
    }

    expect(createBulkWasteInputSpy).toHaveBeenCalledTimes(3)

    assertMetricsCounterWasCalled(metricsCounterSpy)
  })

  it('creates multiple waste inputs with a waste input containing a warning', async () => {
    payload[0].wasteItems[0].disposalOrRecoveryCodes = []

    const createBulkWasteInputSpy = jest.spyOn(
      movementCreateBulk,
      'createBulkWasteInput'
    )
    const metricsCounterSpy = jest.spyOn(metricsCounter, 'metricsCounter')

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

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      status: BULK_RESPONSE_STATUS.MOVEMENTS_CREATED,
      movements: [
        {
          wasteTrackingId: '26S8EYDJ',
          validation: {
            warnings: [
              {
                errorType: 'NotProvided',
                key: 'wasteItems.0.disposalOrRecoveryCodes',
                message:
                  'wasteItems[0].disposalOrRecoveryCodes is required for proper waste tracking and compliance'
              }
            ]
          }
        },
        { wasteTrackingId: '26NWSIXF' }
      ]
    })

    for (const [index, item] of result.movements.entries()) {
      const createdWasteInput = await testMongoDb
        .collection('waste-inputs')
        .findOne({ _id: item.wasteTrackingId })

      expect(createdWasteInput.wasteTrackingId).toEqual(item.wasteTrackingId)
      expect(createdWasteInput.revision).toEqual(1)
      expect(createdWasteInput.receipt).toEqual({
        movement: {
          ...payload[index],
          submittingOrganisation: undefined
        }
      })
      expect(createdWasteInput.createdAt).toBeInstanceOf(Date)
      expect(createdWasteInput.lastUpdatedAt).toBeInstanceOf(Date)
      expect(createdWasteInput.createdAt).toEqual(
        createdWasteInput.lastUpdatedAt
      )
      expect(createdWasteInput.submittingOrganisation).toEqual(
        payload[index].submittingOrganisation
      )
      expect(createdWasteInput.traceId).toEqual(traceId)
    }

    expect(createBulkWasteInputSpy).toHaveBeenCalledTimes(3)

    assertMetricsCounterWasCalled(metricsCounterSpy)
  })

  it('should return existing waste tracking ids when provided with a bulk id which has already been used by the POST endpoint in the waste-inputs collection', async () => {
    const metricsCounterSpy = jest.spyOn(metricsCounter, 'metricsCounter')

    await server.inject({
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.OK)
    expect(result).toEqual({
      status: BULK_RESPONSE_STATUS.MOVEMENTS_NOT_CREATED,
      movements: [
        { wasteTrackingId: '26S8EYDJ' },
        { wasteTrackingId: '26NWSIXF' }
      ]
    })

    // Expect metricsCounter to be called twice as the endpoint is called twice above, metricsCounter
    // should only called the first time
    assertMetricsCounterWasCalled(metricsCounterSpy)
  })

  it('should return existing waste tracking ids when provided with a bulk id which has already been used by the POST endpoint in the waste-inputs-history collection', async () => {
    const metricsCounterSpy = jest.spyOn(metricsCounter, 'metricsCounter')

    await server.inject({
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.OK)
    expect(result).toEqual({
      status: BULK_RESPONSE_STATUS.MOVEMENTS_NOT_CREATED,
      movements: [
        { wasteTrackingId: '26S8EYDJ' },
        { wasteTrackingId: '26NWSIXF' }
      ]
    })

    // Expect metricsCounter to be called twice as the endpoint is called twice above, metricsCounter
    // should only called the first time
    assertMetricsCounterWasCalled(metricsCounterSpy)
  })

  it('should create new waste inputs when provided with a bulk id which has already been used by the PUT endpoint in the waste-inputs collection', async () => {
    const metricsCounterSpy = jest.spyOn(metricsCounter, 'metricsCounter')

    await server.inject({
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload: [{ ...payload[0], wasteTrackingId: '26NWSIXF' }],
      headers: {
        'x-cdp-request-id': traceId
      }
    })
    await wasteInputsCollection.updateOne({ bulkId }, { $inc: { revision: 1 } })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      status: BULK_RESPONSE_STATUS.MOVEMENTS_CREATED,
      movements: [
        { wasteTrackingId: '26S8EYDJ' },
        { wasteTrackingId: '26NWSIXF' }
      ]
    })

    assertMetricsCounterWasCalled(metricsCounterSpy)
  })

  it('should create new waste inputs when provided with a bulk id which has already been used by the PUT endpoint in the waste-inputs-history collection', async () => {
    const metricsCounterSpy = jest.spyOn(metricsCounter, 'metricsCounter')

    await server.inject({
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload: [{ ...payload[0], wasteTrackingId: '26NWSIXF' }],
      headers: {
        'x-cdp-request-id': traceId
      }
    })
    await wasteInputsCollection.updateOne({ bulkId }, { $inc: { revision: 1 } })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.CREATED)
    expect(result).toEqual({
      status: BULK_RESPONSE_STATUS.MOVEMENTS_CREATED,
      movements: [
        { wasteTrackingId: '26S8EYDJ' },
        { wasteTrackingId: '26NWSIXF' }
      ]
    })

    assertMetricsCounterWasCalled(metricsCounterSpy)
  })

  it('can handle multiple concurrent requests with the same bulkId', async () => {
    const request = {
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    }

    const results = await Promise.all([
      server.inject(request),
      server.inject(request),
      server.inject(request),
      server.inject(request),
      server.inject(request)
    ])

    results.forEach((result, index) =>
      expect(JSON.parse(result.payload)).toEqual({
        status:
          index === 0
            ? BULK_RESPONSE_STATUS.MOVEMENTS_CREATED
            : BULK_RESPONSE_STATUS.MOVEMENTS_NOT_CREATED,
        movements: [
          { wasteTrackingId: '26S8EYDJ' },
          { wasteTrackingId: '26NWSIXF' }
        ]
      })
    )
  })

  it('handles error when creating multiple waste inputs fails', async () => {
    const createBulkWasteInputSpy = jest.spyOn(
      movementCreateBulk,
      'createBulkWasteInput'
    )
    const metricsCounterSpy = jest.spyOn(metricsCounter, 'metricsCounter')

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

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      error: 'Error',
      message: errorMessage
    })

    expect(createBulkWasteInputSpy).toHaveBeenCalledTimes(3)
    expect(metricsCounterSpy).not.toHaveBeenCalled()
  })

  it("throws an error when the number of waste tracking ids generated doesn't match the number of movements in the payload", async () => {
    jest.spyOn(batch, 'getBatches').mockReturnValue([])

    const createBulkWasteInputSpy = jest.spyOn(
      movementCreateBulk,
      'createBulkWasteInput'
    )
    const metricsCounterSpy = jest.spyOn(metricsCounter, 'metricsCounter')

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/bulk/${bulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      error: 'Error',
      message:
        "Created wasteTrackingId count (0) doesn't match the request payload count (2) for bulkId (fccbd30d-3082-494d-b470-15b13a7bbaa8)"
    })

    expect(createBulkWasteInputSpy).toHaveBeenCalledTimes(0)
    expect(metricsCounterSpy).not.toHaveBeenCalled()
  })
})
