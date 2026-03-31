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
import * as movementCreate from '../services/movement-create.js'
import { requestTracing } from '../common/helpers/request-tracing.js'
import * as metrics from '../common/helpers/metrics.js'
import { createTestPayload } from '../schemas/test-helpers/waste-test-helpers.js'

jest.mock('../services/movement-create.js', () => {
  const { createWasteInput: actualFunction } = jest.requireActual(
    '../services/movement-create.js'
  )
  return { createWasteInput: jest.fn(actualFunction) }
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
const orgId3 = '7bbbe5a1a-82fa-48bf-bb8c-b516b8aa1ef4'

describe('movement Route Tests', () => {
  let server
  let mongoClient
  let testMongoDb

  const errorMessage = 'Database connection failed'
  const traceId = 'created-trace-id-123'

  beforeAll(async () => {
    server = hapi.server()
    server.route(createReceiptMovement)
    await server.register([requestLogger, mongoDb, requestTracing])
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
      movement: createTestPayload()
    }
    const createWasteInputSpy = jest.spyOn(movementCreate, 'createWasteInput')
    const metricsCounterSpy = jest.spyOn(metrics, 'metricsCounter')

    movementCreate.createWasteInput
      .mockImplementationOnce(() => {
        throw new Error(errorMessage)
      })
      .mockImplementationOnce(() => {
        throw new Error(errorMessage)
      })

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: expectedPayload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(204)
    expect(result).toEqual(null)

    const actualWasteInput = await testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })

    expect(actualWasteInput.wasteTrackingId).toEqual(wasteTrackingId)
    expect(actualWasteInput.revision).toEqual(1)
    expect(actualWasteInput.submittingOrganisation).toEqual({
      defraCustomerOrganisationId: orgId1
    })
    expect(actualWasteInput.createdAt).toBeInstanceOf(Date)
    expect(actualWasteInput.lastUpdatedAt).toBeInstanceOf(Date)
    expect(actualWasteInput.createdAt).toEqual(actualWasteInput.lastUpdatedAt)
    expect(actualWasteInput.traceId).toEqual(traceId)

    expect(createWasteInputSpy).toHaveBeenCalledTimes(3)

    expect(metricsCounterSpy).toHaveBeenCalledTimes(1)
    expect(metricsCounterSpy).toHaveBeenCalledWith('receiver.orgId', 1, {
      orgId: orgId1
    })
  })

  it('rejects when Mongo throws a schema validation error', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const payload = {
      movement: createTestPayload()
    }

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.BAD_REQUEST)
    expect(result).toEqual({
      statusCode: HTTP_STATUS_CODES.BAD_REQUEST,
      error: 'ValidationError',
      message:
        '[{"operatorName":"properties","propertiesNotSatisfied":[{"propertyName":"traceId","details":[{"operatorName":"bsonType","specifiedAs":{"bsonType":"string"},"reason":"type did not match","consideredValue":null,"consideredType":"null"}]}]}]'
    })
  })

  it('handles error when creating a waste input fails', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const payload = {
      movement: createTestPayload()
    }
    const createWasteInputSpy = jest.spyOn(movementCreate, 'createWasteInput')
    const metricsCounterSpy = jest.spyOn(metrics, 'metricsCounter')

    movementCreate.createWasteInput.mockRejectedValue(new Error(errorMessage))

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      statusCode: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      error: 'Error',
      message: errorMessage
    })

    expect(createWasteInputSpy).toHaveBeenCalledTimes(3)

    expect(metricsCounterSpy).not.toHaveBeenCalled()
  })

  it('does not create waste input when validation fails', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const invalidPayload = {
      movement: {
        ...createTestPayload(),
        submittingOrganisation: undefined
      }
    }

    const { statusCode } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: invalidPayload
    })

    expect(statusCode).toEqual(400)

    const actualWasteInput = await testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })

    expect(actualWasteInput).toBeNull()
  })

  it('creates a waste input with a different submittingOrganisation', async () => {
    const { createWasteInput: actualFunction } = jest.requireActual(
      '../services/movement-create.js'
    )
    movementCreate.createWasteInput.mockImplementation(actualFunction)
    const wasteTrackingId = generateWasteTrackingId()
    const payload = {
      movement: createTestPayload({
        submittingOrganisation: {
          defraCustomerOrganisationId: orgId3
        }
      })
    }

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload,
      headers: {
        'x-cdp-request-id': 'trace-123'
      }
    })

    expect(statusCode).toEqual(204)
    expect(result).toEqual(null)

    const actualWasteInput = await testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })

    expect(actualWasteInput.wasteTrackingId).toEqual(wasteTrackingId)
    expect(actualWasteInput.submittingOrganisation).toEqual({
      defraCustomerOrganisationId: orgId3
    })
  })
})
