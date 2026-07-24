import {
  expect,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  it,
  jest
} from '@jest/globals'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'
import { HTTP_STATUS } from 'waste-movement-utils'
import * as movementCreate from '../services/movement-create.js'
import { config } from '../config.js'
import {
  orgId1,
  base64EncodedOrgApiCodes,
  orgId3,
  apiCode3
} from '../test/data/apiCodes.js'
import * as metrics from '../common/helpers/metrics.js'
import { createTestPayload } from '../schemas/test-helpers/waste-test-helpers.js'
import {
  requestBasicAuthTest1,
  userBasicAuthTest1
} from '../test/data/basic-auth.js'
import { createServer } from '../server.js'

jest.mock('../services/movement-create.js', () => {
  const { createWasteInput: actualFunction } = jest.requireActual(
    '../services/movement-create.js'
  )
  return { createWasteInput: jest.fn(actualFunction) }
})

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

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockReturnValue(true)
}))

describe('movement Route Tests', () => {
  let server
  let mongoClient
  let testMongoDb

  const errorMessage = 'Database connection failed'
  const traceId = 'created-trace-id-123'

  beforeAll(async () => {
    const testMongo = await createTestMongoDb()
    mongoClient = testMongo.client
    testMongoDb = testMongo.db

    config.set('orgApiCodes', base64EncodedOrgApiCodes)

    process.env.ACCESS_CRED_TEST1 = userBasicAuthTest1

    server = await createServer()
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
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
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
    expect(actualWasteInput.traceId).toEqual(traceId)

    expect(createWasteInputSpy).toHaveBeenCalledTimes(3)

    expect(metricsCounterSpy).toHaveBeenCalledTimes(1)
    expect(metricsCounterSpy).toHaveBeenCalledWith('receiver.orgId', 1, {
      orgId: actualWasteInput.orgId
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
      payload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(result).toEqual({
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      error: 'Error',
      message: errorMessage
    })

    expect(createWasteInputSpy).toHaveBeenCalledTimes(3)

    expect(metricsCounterSpy).not.toHaveBeenCalled()
  })

  it('does not create waste input when validation fails', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const invalidPayload = {
      ...createTestPayload(),
      apiCode: undefined
    }

    const { statusCode } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: invalidPayload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(400)

    const actualWasteInput = await testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })

    expect(actualWasteInput).toBeNull()
  })

  it('rejects when apiCode is invalid', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const payload = {
      movement: {
        ...createTestPayload(),
        apiCode: apiCode3
      }
    }

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
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
      config.set('orgApiCodes', value)

      const wasteTrackingId = generateWasteTrackingId()
      const payload = {
        movement: createTestPayload()
      }

      const { statusCode, result } = await server.inject({
        method: 'POST',
        url: `/movements/${wasteTrackingId}/receive`,
        payload,
        headers: {
          'x-cdp-request-id': traceId,
          Authorization: `Basic ${requestBasicAuthTest1}`
        }
      })

      expect(statusCode).toEqual(HTTP_STATUS.BAD_REQUEST)
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

  it('creates a waste input with submittingOrganisation when apiCode matches the orgApiCodes secret value', async () => {
    const { createWasteInput: actualFunction } = jest.requireActual(
      '../services/movement-create.js'
    )
    movementCreate.createWasteInput.mockImplementation(actualFunction)
    config.set('orgApiCodes', base64EncodedOrgApiCodes)
    const wasteTrackingId = generateWasteTrackingId()
    const payload = {
      movement: {
        ...createTestPayload(),
        apiCode: undefined,
        submittingOrganisation: {
          defraCustomerOrganisationId: orgId1
        }
      }
    }

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(204)
    expect(result).toEqual(null)

    const actualWasteInput = await testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })

    expect(actualWasteInput.wasteTrackingId).toEqual(wasteTrackingId)
    expect(actualWasteInput.submittingOrganisation).toEqual({
      defraCustomerOrganisationId: orgId1
    })
  })

  it('creates a waste input with submittingOrganisation and ignores apiCode mismatch', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const payload = {
      movement: {
        ...createTestPayload(),
        apiCode: undefined,
        submittingOrganisation: {
          defraCustomerOrganisationId: orgId3
        }
      }
    }

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
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

  it('creates a waste input without submittingOrganisation', async () => {
    const { createWasteInput: actualFunction } = jest.requireActual(
      '../services/movement-create.js'
    )
    movementCreate.createWasteInput.mockImplementation(actualFunction)
    config.set('orgApiCodes', base64EncodedOrgApiCodes)
    const wasteTrackingId = generateWasteTrackingId()
    const movement = createTestPayload()

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: {
        movement
      },
      headers: {
        'x-cdp-request-id': traceId,
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(204)
    expect(result).toEqual(null)

    const actualWasteInput = await testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })

    expect(actualWasteInput.wasteTrackingId).toEqual(wasteTrackingId)
    expect(actualWasteInput.submittingOrganisation).toBeNull()
  })

  it('should return 401 when request is unauthenticated', async () => {
    const wasteTrackingId = generateWasteTrackingId()

    const { statusCode } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: { movement: createTestPayload() }
    })

    expect(statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED)
  })

  it('persists clientId at the top level when provided', async () => {
    const { createWasteInput: actualFunction } = jest.requireActual(
      '../services/movement-create.js'
    )
    movementCreate.createWasteInput.mockImplementation(actualFunction)
    config.set('orgApiCodes', base64EncodedOrgApiCodes)
    const wasteTrackingId = generateWasteTrackingId()
    const clientId = 'test-client-id'
    const payload = {
      movement: {
        ...createTestPayload(),
        clientId
      }
    }

    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload,
      headers: {
        'x-cdp-request-id': 'trace-client',
        Authorization: `Basic ${requestBasicAuthTest1}`
      }
    })

    expect(statusCode).toEqual(204)
    expect(result).toEqual(null)

    const actualWasteInput = await testMongoDb
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })

    expect(actualWasteInput.clientId).toEqual(clientId)
    // clientId is stored top-level, not nested inside the receipt movement
    expect(actualWasteInput.receipt.movement.clientId).toBeUndefined()
  })
})
