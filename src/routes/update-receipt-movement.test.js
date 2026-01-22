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
import { apiCode1, base64EncodedOrgApiCodes } from '../test/data/apiCodes.js'
import * as movementUpdate from '../services/movement-update.js'
import { requestTracing } from '../common/helpers/request-tracing.js'

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

  beforeEach(async () => {
    config.set('orgApiCodes', base64EncodedOrgApiCodes)
  })

  it('updates a waste input', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const createPayload = {
      movement: {
        receivingSiteId: 'test',
        receiverReference: 'test',
        specialHandlingRequirements: 'test',
        apiCode: apiCode1
      }
    }

    const createResult = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: createPayload
    })

    expect(createResult.statusCode).toEqual(204)
    expect(createResult.result).toEqual(null)

    const beforeUpdate = await testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })
    const timestampBeforeUpdate = beforeUpdate.lastUpdatedAt

    const updatePayload = {
      movement: {
        receivingSiteId: 'updated-site',
        receiverReference: 'updated-ref',
        specialHandlingRequirements: 'updated-requirements',
        apiCode: apiCode1
      }
    }
    const updateWasteInputSpy = jest.spyOn(movementUpdate, 'updateWasteInput')

    movementUpdate.updateWasteInput
      .mockImplementationOnce(() => {
        throw new Error(errorMessage)
      })
      .mockImplementationOnce(() => {
        throw new Error(errorMessage)
      })

    await updateReceipt(wasteTrackingId, updatePayload, traceId)

    const actualWasteInput = await testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })
    expect(actualWasteInput.wasteTrackingId).toEqual(wasteTrackingId)
    expect(actualWasteInput.revision).toEqual(2)
    expect(actualWasteInput.receipt.movement).toEqual(updatePayload.movement)
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
    expect(historicState[0].receipt.movement).toEqual(createPayload.movement)

    expect(updateWasteInputSpy).toHaveBeenCalledTimes(3)
  })

  async function getCurrentWasteInput(wasteTrackingId) {
    return testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })
  }

  it('updates a waste input twice and stores all history', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const createPayload = {
      movement: {
        receivingSiteId: 'test',
        receiverReference: 'test',
        specialHandlingRequirements: 'test',
        apiCode: apiCode1
      }
    }

    const createResult = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: createPayload
    })

    expect(createResult.statusCode).toEqual(204)
    expect(createResult.result).toEqual(null)

    const updatePayload = {
      movement: {
        receivingSiteId: 'updated-site',
        receiverReference: 'updated-ref',
        specialHandlingRequirements: 'updated-requirements',
        apiCode: apiCode1
      }
    }
    await updateReceipt(wasteTrackingId, updatePayload, traceId)

    const afterFirstUpdate = await getCurrentWasteInput(wasteTrackingId)
    const timestampAfterFirstUpdate = afterFirstUpdate.lastUpdatedAt

    const updatePayload2 = {
      movement: {
        receivingSiteId: 'updated-site2',
        receiverReference: 'updated-ref2',
        specialHandlingRequirements: 'updated-requirements2',
        apiCode: apiCode1
      }
    }
    const traceIdUpdate2 = 'trace-id-update-2'
    await updateReceipt(wasteTrackingId, updatePayload2, traceIdUpdate2)

    const actualWasteInput = await getCurrentWasteInput(wasteTrackingId)
    expect(actualWasteInput.wasteTrackingId).toEqual(wasteTrackingId)
    expect(actualWasteInput.revision).toEqual(3)
    expect(actualWasteInput.receipt.movement).toEqual(updatePayload2.movement)
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
    expect(historicState[0].receipt.movement).toEqual(createPayload.movement)
    expect(historicState[1]._id).toBeDefined()
    expect(historicState[1].wasteTrackingId).toEqual(wasteTrackingId)
    expect(historicState[1].revision).toEqual(2)
    expect(historicState[1].receipt.movement).toEqual(updatePayload.movement)
  })

  it('returns 404 when updating a non-existent waste input', async () => {
    const wasteTrackingId = 'nonexistent-id'
    const updatePayload = {
      movement: {
        receivingSiteId: 'updated-site',
        receiverReference: 'updated-ref',
        apiCode: apiCode1,
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

  it('rejects when the api code is missing', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const createPayload = {
      movement: {
        receivingSiteId: 'test',
        receiverReference: 'test',
        specialHandlingRequirements: 'test',
        apiCode: apiCode1
      }
    }

    const createResult = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: createPayload
    })

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

    expect(statusCode).toEqual(HTTP_STATUS_CODES.BAD_REQUEST)
    expect(result).toEqual({
      validation: {
        errors: [
          {
            key: 'apiCode',
            errorType: 'InvalidValue',
            message: 'the API Code supplied is invalid'
          }
        ]
      }
    })
  })

  it('rejects when the api code is invalid', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const createPayload = {
      movement: {
        receivingSiteId: 'test',
        receiverReference: 'test',
        specialHandlingRequirements: 'test',
        apiCode: apiCode1
      }
    }

    const createResult = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: createPayload
    })

    expect(createResult.statusCode).toEqual(204)
    expect(createResult.result).toEqual(null)

    const updatePayload = {
      movement: {
        receivingSiteId: 'updated-site',
        receiverReference: 'updated-ref',
        specialHandlingRequirements: 'updated-requirements',
        apiCode: 'invalid'
      }
    }

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: updatePayload
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.BAD_REQUEST)
    expect(result).toEqual({
      validation: {
        errors: [
          {
            key: 'apiCode',
            errorType: 'InvalidValue',
            message: 'the API Code supplied is invalid'
          }
        ]
      }
    })
  })

  it.each([undefined, null, ''])(
    'rejects when ORG_API_CODES secret does not have a value: "%s"',
    async (value) => {
      const wasteTrackingId = generateWasteTrackingId()
      const createPayload = {
        movement: {
          receivingSiteId: 'test',
          receiverReference: 'test',
          specialHandlingRequirements: 'test',
          apiCode: apiCode1
        }
      }

      const createResult = await server.inject({
        method: 'POST',
        url: `/movements/${wasteTrackingId}/receive`,
        payload: createPayload
      })

      expect(createResult.statusCode).toEqual(204)
      expect(createResult.result).toEqual(null)

      config.set('orgApiCodes', value)

      const updatePayload = {
        movement: {
          receivingSiteId: 'updated-site',
          receiverReference: 'updated-ref',
          specialHandlingRequirements: 'updated-requirements',
          apiCode: apiCode1
        }
      }

      const { statusCode, result } = await server.inject({
        method: 'PUT',
        url: `/movements/${wasteTrackingId}/receive`,
        payload: updatePayload
      })

      expect(statusCode).toEqual(HTTP_STATUS_CODES.BAD_REQUEST)
      expect(result).toEqual({
        validation: {
          errors: [
            {
              key: 'apiCode',
              errorType: 'InvalidValue',
              message: 'the API Code supplied is invalid'
            }
          ]
        }
      })
    }
  )

  it('rejects when the org id of the updated entry does not match the org id of the original entry', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const createPayload = {
      movement: {
        receivingSiteId: 'test',
        receiverReference: 'test',
        specialHandlingRequirements: 'test',
        apiCode: apiCode1
      }
    }

    const createResult = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: createPayload
    })

    expect(createResult.statusCode).toEqual(204)
    expect(createResult.result).toEqual(null)

    const updatePayload = {
      movement: {
        receivingSiteId: 'updated-site',
        receiverReference: 'updated-ref',
        specialHandlingRequirements: 'updated-requirements',
        apiCode: 'bc05d1ce-5a80-4624-b2ae-e7227c8c6c41'
      }
    }

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: updatePayload
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.BAD_REQUEST)
    expect(result).toEqual({
      validation: {
        errors: [
          {
            key: 'apiCode',
            errorType: 'BusinessRuleViolation',
            message:
              'the API Code supplied does not relate to the same Organisation as created the original waste item record'
          }
        ]
      }
    })
  })

  it('handles error when updating a waste input fails', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const payload = {
      movement: {
        receivingSiteId: 'string',
        receiverReference: 'string',
        specialHandlingRequirements: 'string',
        apiCode: apiCode1
      }
    }
    const updateWasteInputSpy = jest.spyOn(movementUpdate, 'updateWasteInput')

    movementUpdate.updateWasteInput.mockRejectedValue(new Error(errorMessage))

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/movements/${wasteTrackingId}/receive`,
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
