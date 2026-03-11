import { expect, describe, beforeAll, afterAll, it, jest } from '@jest/globals'
import hapi from '@hapi/hapi'
import Basic from '@hapi/basic'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import { mongoDb } from '../common/helpers/mongodb.js'
import { requestLogger } from '../common/helpers/logging/request-logger.js'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import * as movementUpdateBulk from '../services/movement-update-bulk.js'
import { requestTracing } from '../common/helpers/request-tracing.js'
import { updateBulkReceiptMovement } from './update-bulk-receipt-movement.js'
import { failAction } from '../common/helpers/fail-action.js'
import {
  orgId1,
  apiCode1,
  apiCode2,
  base64EncodedOrgApiCodes
} from '../test/data/apiCodes.js'
import { BULK_RESPONSE_STATUS } from '../common/constants/bulk-response-status.js'
import { config } from '../config.js'
import { createBulkMovementRequest } from '../test/utils/createBulkMovementRequest.js'

jest.mock('../common/constants/exponential-backoff.js', () => ({
  BACKOFF_OPTIONS: {
    numOfAttempts: 3,
    startingDelay: 1
  }
}))

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockReturnValue(true)
}))

describe('Update Bulk Receipt Movement Route Tests', () => {
  let server
  let mongoClient
  let testMongoDb
  let replicaSet
  let mongoUri
  let wasteInputsCollection
  let wasteInputsHistoryCollection
  let payload

  const errorMessage = 'Database connection failed'
  const traceId = 'updated-trace-id-123'
  const createBulkId = 'fccbd30d-3082-494d-b470-15b13a7bbaa8'
  const updateBulkId = 'a1b2c3d4-5678-9012-3456-789012345678'
  const seedWasteInputs = [
    {
      _id: '26E4C7Z2',
      wasteTrackingId: '26E4C7Z2',
      receipt: { movement: {} },
      createdAt: new Date(),
      lastUpdatedAt: new Date(),
      orgId: orgId1,
      submittingOrganisation: {
        defraCustomerOrganisationId: 'fd98d4ef34e33b34fc8fad03f8c385'
      },
      traceId: 'created-trace-id-123',
      bulkId: createBulkId,
      revision: 1
    },
    {
      _id: '266XHTDL',
      wasteTrackingId: '266XHTDL',
      receipt: { movement: {} },
      createdAt: new Date(),
      lastUpdatedAt: new Date(),
      orgId: orgId1,
      submittingOrganisation: {
        defraCustomerOrganisationId: 'fd98d4ef34e33b34fc8fad03f8c385'
      },
      traceId: 'created-trace-id-123',
      bulkId: createBulkId,
      revision: 1
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
    server.route(updateBulkReceiptMovement)
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

    // Seed existing waste inputs (created by POST bulk endpoint)
    await wasteInputsCollection.insertMany(
      seedWasteInputs.map((wi) => ({ ...wi }))
    )

    payload = [
      createBulkMovementRequest({ wasteTrackingId: '26E4C7Z2' }),
      createBulkMovementRequest({ wasteTrackingId: '266XHTDL' })
    ]
  })

  it('updates multiple waste inputs', async () => {
    const updateBulkWasteInputSpy = jest.spyOn(
      movementUpdateBulk,
      'updateBulkWasteInput'
    )

    movementUpdateBulk.updateBulkWasteInput
      .mockImplementationOnce(() => {
        throw new Error(errorMessage)
      })
      .mockImplementationOnce(() => {
        throw new Error(errorMessage)
      })

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/bulk/${updateBulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.OK)
    expect(result).toEqual({
      status: BULK_RESPONSE_STATUS.MOVEMENTS_UPDATED,
      movements: [{}, {}]
    })

    for (const item of result.movements) {
      expect(item).toEqual({})
    }

    expect(updateBulkWasteInputSpy).toHaveBeenCalledTimes(3)
  })

  it('should return NO_MOVEMENTS_UPDATED when provided with a bulk id which has already been used by the PUT endpoint in the waste-inputs collection', async () => {
    // Update the seed data to have revision > 1 with the update bulkId
    await wasteInputsCollection.updateMany(
      {},
      { $set: { bulkId: updateBulkId, revision: 2 } }
    )

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/bulk/${updateBulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.OK)
    expect(result).toEqual({
      status: BULK_RESPONSE_STATUS.NO_MOVEMENTS_UPDATED,
      movements: [{}, {}]
    })
  })

  it('should return NO_MOVEMENTS_UPDATED when provided with a bulk id which has already been used by the PUT endpoint in the waste-inputs-history collection', async () => {
    await wasteInputsHistoryCollection.insertMany([
      {
        wasteTrackingId: '26E4C7Z2',
        receipt: { movement: {} },
        orgId: orgId1,
        traceId,
        bulkId: updateBulkId,
        revision: 2,
        timestamp: new Date()
      },
      {
        wasteTrackingId: '266XHTDL',
        receipt: { movement: {} },
        orgId: orgId1,
        traceId,
        bulkId: updateBulkId,
        revision: 2,
        timestamp: new Date()
      }
    ])

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/bulk/${updateBulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.OK)
    expect(result).toEqual({
      status: BULK_RESPONSE_STATUS.NO_MOVEMENTS_UPDATED,
      movements: [{}, {}]
    })
  })

  it('should proceed with update when bulkId exists with revision 1 only (POST endpoint bulkId)', async () => {
    // Seed data already has revision: 1 with createBulkId
    // Using createBulkId as the PUT bulkId - since all matches have revision: 1,
    // the idempotency check for revision > 1 should NOT trigger
    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/bulk/${createBulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.OK)
    expect(result).toEqual({
      status: BULK_RESPONSE_STATUS.MOVEMENTS_UPDATED,
      movements: [{}, {}]
    })
  })

  it('should return 400 when submittingOrganisation does not match and existing record has no submittingOrganisation', async () => {
    await wasteInputsCollection.updateOne(
      { _id: '26E4C7Z2' },
      { $unset: { submittingOrganisation: '' } }
    )

    payload = [
      createBulkMovementRequest({
        wasteTrackingId: '26E4C7Z2',
        submittingOrganisation: {
          defraCustomerOrganisationId: 'some-org-id'
        }
      }),
      createBulkMovementRequest({ wasteTrackingId: '266XHTDL' })
    ]

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/bulk/${updateBulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.BAD_REQUEST)
    expect(result).toEqual([
      {
        validation: {
          errors: [
            {
              key: '0.submittingOrganisation',
              errorType: 'BusinessRuleViolation',
              message:
                '[0].submittingOrganisation the submitting organisation does not match the Organisation that created the original waste item record'
            }
          ]
        }
      },
      {}
    ])
  })

  it('should return 400 when submittingOrganisation does not match the original record', async () => {
    payload = [
      createBulkMovementRequest({
        wasteTrackingId: '26E4C7Z2',
        submittingOrganisation: {
          defraCustomerOrganisationId: 'different-org-id'
        }
      }),
      createBulkMovementRequest({ wasteTrackingId: '266XHTDL' })
    ]

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/bulk/${updateBulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.BAD_REQUEST)
    expect(result).toEqual([
      {
        validation: {
          errors: [
            {
              key: '0.submittingOrganisation',
              errorType: 'BusinessRuleViolation',
              message:
                '[0].submittingOrganisation the submitting organisation does not match the Organisation that created the original waste item record'
            }
          ]
        }
      },
      {}
    ])
  })

  it('should succeed when apiCode org matches the original record', async () => {
    config.set('orgApiCodes', base64EncodedOrgApiCodes)

    const apiCodeItem = createBulkMovementRequest({
      wasteTrackingId: '26E4C7Z2',
      apiCode: apiCode1
    })
    delete apiCodeItem.submittingOrganisation

    payload = [
      apiCodeItem,
      createBulkMovementRequest({ wasteTrackingId: '266XHTDL' })
    ]

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/bulk/${updateBulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.OK)
    expect(result.status).toEqual(BULK_RESPONSE_STATUS.MOVEMENTS_UPDATED)
  })

  it('should return 400 when apiCode org does not match the original record', async () => {
    config.set('orgApiCodes', base64EncodedOrgApiCodes)

    const apiCodeItem = createBulkMovementRequest({
      wasteTrackingId: '26E4C7Z2',
      apiCode: apiCode2
    })
    delete apiCodeItem.submittingOrganisation

    payload = [
      apiCodeItem,
      createBulkMovementRequest({ wasteTrackingId: '266XHTDL' })
    ]

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/bulk/${updateBulkId}/movements/receive`,
      payload,
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.BAD_REQUEST)
    expect(result).toEqual([
      {
        validation: {
          errors: [
            {
              key: '0.apiCode',
              errorType: 'BusinessRuleViolation',
              message:
                '[0].apiCode the API Code supplied does not relate to the same Organisation as created the original waste item record'
            }
          ]
        }
      },
      {}
    ])
  })

  it('handles error when updating multiple waste inputs fails', async () => {
    const updateBulkWasteInputSpy = jest.spyOn(
      movementUpdateBulk,
      'updateBulkWasteInput'
    )

    movementUpdateBulk.updateBulkWasteInput.mockRejectedValue(
      new Error(errorMessage)
    )

    const { statusCode, result } = await server.inject({
      method: 'PUT',
      url: `/bulk/${updateBulkId}/movements/receive`,
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

    expect(updateBulkWasteInputSpy).toHaveBeenCalledTimes(3)
  })

  it('should return 400 when payload is an empty array', async () => {
    const { statusCode } = await server.inject({
      method: 'PUT',
      url: `/bulk/${updateBulkId}/movements/receive`,
      payload: [],
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.BAD_REQUEST)
  })

  it('should return 400 when payload is not an array', async () => {
    const { statusCode } = await server.inject({
      method: 'PUT',
      url: `/bulk/${updateBulkId}/movements/receive`,
      payload: { notAnArray: true },
      headers: {
        'x-cdp-request-id': traceId
      }
    })

    expect(statusCode).toEqual(HTTP_STATUS_CODES.BAD_REQUEST)
  })
})

describe('Update Bulk Receipt Movement Auth Tests', () => {
  let server

  beforeAll(async () => {
    server = hapi.server({
      routes: {
        validate: {
          options: { abortEarly: false },
          failAction
        }
      }
    })
    await server.register(Basic)
    server.auth.strategy('service-token', 'basic', {
      validate: async () => ({ isValid: false, credentials: {} })
    })
    server.auth.default('service-token')
    server.route(updateBulkReceiptMovement)
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('should return 401 when request is unauthenticated', async () => {
    const { statusCode } = await server.inject({
      method: 'PUT',
      url: '/bulk/some-bulk-id/movements/receive',
      payload: [{ wasteTrackingId: '26E4C7Z2' }]
    })

    expect(statusCode).toEqual(401)
  })
})
