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
import { config } from '../config.js'
import { apiCode1, base64EncodedOrgApiCodes } from '../test/data/apiCodes.js'

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

describe('movement Route Tests', () => {
  let server
  let mongoClient
  let testMongoDb

  const errorMessage = 'Database connection failed'

  beforeAll(async () => {
    server = hapi.server()
    server.route(createReceiptMovement)
    await server.register([requestLogger, mongoDb])
    await server.initialize()
    const testMongo = await createTestMongoDb()
    mongoClient = testMongo.client
    testMongoDb = testMongo.db
    config.set('orgApiCodes', base64EncodedOrgApiCodes)
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
        specialHandlingRequirements: 'string',
        apiCode: apiCode1
      }
    }
    const createWasteInputSpy = jest.spyOn(movementCreate, 'createWasteInput')

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
    expect(actualWasteInput.createdAt).toBeInstanceOf(Date)
    expect(actualWasteInput.lastUpdatedAt).toBeInstanceOf(Date)
    expect(actualWasteInput.createdAt).toEqual(actualWasteInput.lastUpdatedAt)
    expect(actualWasteInput.orgId).toBeDefined()
    expect(createWasteInputSpy).toHaveBeenCalledTimes(3)
  })

  it('handles error when creating a waste input fails', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const payload = {
      movement: {
        receivingSiteId: 'string',
        receiverReference: 'string',
        specialHandlingRequirements: 'string',
        apiCode: apiCode1
      }
    }
    const createWasteInputSpy = jest.spyOn(movementCreate, 'createWasteInput')

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
  })

  it('does not create waste input when validation fails', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const invalidPayload = {
      // Missing required 'movement' field
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

  it('rejects when apiCode is missing', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const payload = {
      movement: {
        receivingSiteId: 'string',
        receiverReference: 'string',
        specialHandlingRequirements: 'string'
      }
    }

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.BAD_REQUEST)
    expect(result).toEqual({
      validation: {
        errors: [
          {
            key: 'apiCode',
            errorType: 'UnexpectedError',
            message: 'the API Code supplied is invalid'
          }
        ]
      }
    })
  })

  it('rejects when apiCode is invalid', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const payload = {
      movement: {
        receivingSiteId: 'string',
        receiverReference: 'string',
        specialHandlingRequirements: 'string',
        apiCode: 'invalid'
      }
    }

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.BAD_REQUEST)
    expect(result).toEqual({
      validation: {
        errors: [
          {
            key: 'apiCode',
            errorType: 'UnexpectedError',
            message: 'the API Code supplied is invalid'
          }
        ]
      }
    })
  })

  it.each([undefined, null, ''])(
    'rejects when ORG_API_CODES secret does not have a value: "%s"',
    async (value) => {
      config.set('orgApiCodes', value)

      const wasteTrackingId = generateWasteTrackingId()
      const payload = {
        movement: {
          receivingSiteId: 'string',
          receiverReference: 'string',
          specialHandlingRequirements: 'string',
          apiCode: apiCode1
        }
      }

      const { statusCode, result } = await server.inject({
        method: 'POST',
        url: `/movements/${wasteTrackingId}/receive`,
        payload
      })

      expect(statusCode).toEqual(HTTP_STATUS_CODES.BAD_REQUEST)
      expect(result).toEqual({
        validation: {
          errors: [
            {
              key: 'apiCode',
              errorType: 'UnexpectedError',
              message: 'the API Code supplied is invalid'
            }
          ]
        }
      })
    }
  )
})
