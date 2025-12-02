import { updateWasteInput } from './movement-update.js'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from '@jest/globals'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import {
  apiCode1,
  apiCode2,
  base64EncodedOrgApiCodes,
  orgId1,
  orgId2
} from '../test/data/apiCodes.js'
import { config } from '../config.js'
import { ValidationError } from '../common/helpers/errors/validation-error.js'
import * as cdpAuditing from '@defra/cdp-auditing'
import { AUDIT_LOGGER_TYPE } from '../common/constants/audit-logger.js'
import * as logger from '../common/helpers/logging/logger.js'

jest.mock('@hapi/hoek', () => ({
  wait: jest.fn()
}))

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest
    .fn()
    .mockImplementationOnce(() => true)
    .mockImplementationOnce(() => true)
    .mockImplementation(() => {
      throw new Error('Internal Server Error')
    })
}))

describe('updateWasteInput', () => {
  let client
  let db
  let wasteInputsCollection
  let wasteInputsHistoryCollection
  let invalidSubmissionsCollection
  let replicaSet

  const requestTraceId = 'abc-def-123'

  beforeAll(async () => {
    const testMongo = await createTestMongoDb(true)
    client = testMongo.client
    db = testMongo.db
    replicaSet = testMongo.replicaSet
    config.set('orgApiCodes', base64EncodedOrgApiCodes)
  })

  afterAll(async () => {
    if (replicaSet) {
      await replicaSet.stop()
    }
    await client.close()
  })

  beforeEach(async () => {
    wasteInputsCollection = db.collection('waste-inputs')
    wasteInputsHistoryCollection = db.collection('waste-inputs-history')
    invalidSubmissionsCollection = db.collection('invalid-submissions')

    await wasteInputsCollection.deleteMany({})
    await wasteInputsHistoryCollection.deleteMany({})
    await invalidSubmissionsCollection.deleteMany({})
  })

  it('should update waste input and calls audit endpoint when it exists and when fieldToUpdate is not present', async () => {
    const wasteTrackingId = 'test-id'
    const updateData = {
      receipt: { test: 'data' },
      apiCode: apiCode1,
      orgId: orgId1
    }
    const existingWasteInput = {
      _id: wasteTrackingId,
      someData: 'value',
      apiCode: apiCode1,
      orgId: orgId1,
      createdAt: new Date(),
      revision: 1
    }
    const auditSpy = jest.spyOn(cdpAuditing, 'audit')

    await wasteInputsCollection.insertOne(existingWasteInput)

    const result = await updateWasteInput(
      db,
      wasteTrackingId,
      updateData,
      client,
      requestTraceId,
      undefined
    )

    const updatedWasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId
    })

    expect(updatedWasteInput).toMatchObject({
      ...existingWasteInput,
      ...updateData,
      revision: 2
    })
    expect(updatedWasteInput.lastUpdatedAt).toBeInstanceOf(Date)

    const historyEntry = await wasteInputsHistoryCollection.findOne({
      wasteTrackingId
    })
    // ignore _id, it's random in the waste-inputs-history collection
    delete historyEntry._id
    delete existingWasteInput._id

    expect(historyEntry).toMatchObject({
      ...existingWasteInput,
      wasteTrackingId,
      timestamp: expect.any(Date)
    })
    expect(result).toEqual({
      matchedCount: 1,
      modifiedCount: 1
    })

    expect(auditSpy).toHaveBeenCalledTimes(1)
    expect(auditSpy).toHaveBeenCalledWith({
      type: AUDIT_LOGGER_TYPE.MOVEMENT_UPDATED,
      correlationId: requestTraceId,
      version: 1,
      data: updatedWasteInput
    })
  })

  it('should update waste input and calls audit endpoint when it exists and when fieldToUpdate is present', async () => {
    const wasteTrackingId = 'test-id'
    const updateData = {
      receipt: { test: 'data' },
      apiCode: apiCode1,
      orgId: orgId1
    }
    const existingWasteInput = {
      _id: wasteTrackingId,
      someData: 'value',
      apiCode: apiCode1,
      orgId: orgId1,
      createdAt: new Date(),
      revision: 1
    }
    const auditSpy = jest.spyOn(cdpAuditing, 'audit')

    await wasteInputsCollection.insertOne(existingWasteInput)

    const result = await updateWasteInput(
      db,
      wasteTrackingId,
      updateData,
      client,
      requestTraceId,
      'receipt.movement'
    )

    const updatedWasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId
    })

    expect(updatedWasteInput).toMatchObject({
      ...existingWasteInput,
      receipt: {
        movement: updateData
      },
      revision: 2
    })
    expect(updatedWasteInput.lastUpdatedAt).toBeInstanceOf(Date)

    const historyEntry = await wasteInputsHistoryCollection.findOne({
      wasteTrackingId
    })
    // ignore _id, it's random in the waste-inputs-history collection
    delete historyEntry._id
    delete existingWasteInput._id

    expect(historyEntry).toMatchObject({
      ...existingWasteInput,
      wasteTrackingId,
      timestamp: expect.any(Date)
    })
    expect(result).toEqual({
      matchedCount: 1,
      modifiedCount: 1
    })

    expect(auditSpy).toHaveBeenCalledTimes(1)
    expect(auditSpy).toHaveBeenCalledWith({
      type: AUDIT_LOGGER_TYPE.MOVEMENT_UPDATED,
      correlationId: requestTraceId,
      version: 1,
      data: updatedWasteInput
    })
  })

  it('should update waste input and return success response when calling audit endpoint fails', async () => {
    const wasteTrackingId = 'test-id'
    const updateData = {
      receipt: { test: 'data' },
      apiCode: apiCode1,
      orgId: orgId1
    }
    const existingWasteInput = {
      _id: wasteTrackingId,
      someData: 'value',
      apiCode: apiCode1,
      orgId: orgId1,
      createdAt: new Date(),
      revision: 1
    }
    const errorLoggerSpy = jest.spyOn(logger.createLogger(), 'error')

    await wasteInputsCollection.insertOne(existingWasteInput)

    const result = await updateWasteInput(
      db,
      wasteTrackingId,
      updateData,
      client,
      requestTraceId,
      undefined
    )

    const updatedWasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId
    })

    expect(updatedWasteInput).toMatchObject({
      ...existingWasteInput,
      ...updateData,
      revision: 2
    })
    expect(updatedWasteInput.lastUpdatedAt).toBeInstanceOf(Date)

    const historyEntry = await wasteInputsHistoryCollection.findOne({
      wasteTrackingId
    })
    // ignore _id, it's random in the waste-inputs-history collection
    delete historyEntry._id
    delete existingWasteInput._id

    expect(historyEntry).toMatchObject({
      ...existingWasteInput,
      wasteTrackingId,
      timestamp: expect.any(Date)
    })
    expect(result).toEqual({
      matchedCount: 1,
      modifiedCount: 1
    })

    expect(errorLoggerSpy).toHaveBeenCalledTimes(1)
  })

  it('should create invalid submission and not call audit endpoint when waste input does not exist', async () => {
    const wasteTrackingId = 'non-existent-id'
    const updateData = {
      receipt: { test: 'data' },
      apiCode: apiCode1,
      orgId: orgId1
    }
    const auditSpy = jest.spyOn(cdpAuditing, 'audit')

    const result = await updateWasteInput(
      db,
      wasteTrackingId,
      updateData,
      client,
      requestTraceId,
      'receipt.movement'
    )

    const wasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId
    })
    expect(wasteInput).toBeNull()

    const invalidSubmission = await invalidSubmissionsCollection.findOne({
      wasteTrackingId
    })
    expect(invalidSubmission).toMatchObject({
      wasteTrackingId,
      updateData,
      timestamp: expect.any(Date),
      reason: 'Waste input not found'
    })

    const historyEntries = await wasteInputsHistoryCollection
      .find({ wasteTrackingId })
      .toArray()
    expect(historyEntries.length).toBe(0)

    expect(result).toEqual({
      matchedCount: 0,
      modifiedCount: 0
    })

    expect(auditSpy).not.toHaveBeenCalled()
  })

  it('should increment existing revision when updating waste input', async () => {
    const wasteTrackingId = 'test-id-with-revision'
    const updateData = {
      receipt: { test: 'updated-data' },
      apiCode: apiCode1,
      orgId: orgId1
    }
    const existingWasteInput = {
      _id: wasteTrackingId,
      someData: 'value',
      revision: 1,
      apiCode: apiCode1,
      orgId: orgId1
    }

    await wasteInputsCollection.insertOne(existingWasteInput)

    const result = await updateWasteInput(
      db,
      wasteTrackingId,
      updateData,
      client,
      requestTraceId,
      undefined
    )

    const updatedWasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId
    })
    expect(updatedWasteInput).toMatchObject({
      ...existingWasteInput,
      ...updateData,
      revision: 2
    })
    expect(updatedWasteInput.lastUpdatedAt).toBeInstanceOf(Date)

    const historyEntry = await wasteInputsHistoryCollection.findOne({
      wasteTrackingId
    })

    // ignore _id, it's random in the waste-inputs-history collection
    delete historyEntry._id
    delete existingWasteInput._id
    expect(historyEntry).toMatchObject({
      ...existingWasteInput,
      wasteTrackingId,
      timestamp: expect.any(Date)
    })

    expect(result).toEqual({
      matchedCount: 1,
      modifiedCount: 1
    })
  })

  it('should handle database errors and not call audit endpoint', async () => {
    const mockMovement = {
      wasteTrackingId: '124453465'
    }
    const mockError = new Error('Database error')
    const mockDb = {
      collection: () => ({
        findOne: jest.fn().mockRejectedValueOnce(mockError)
      })
    }
    const auditSpy = jest.spyOn(cdpAuditing, 'audit')

    await expect(
      updateWasteInput(
        mockDb,
        1,
        mockMovement,
        client,
        requestTraceId,
        'receipt.movement'
      )
    ).rejects.toThrow(mockError.message)

    expect(auditSpy).not.toHaveBeenCalled()
  })

  it('should return a validation error and not call audit endpoint if the org id of the updated entry does not match the org id of the original entry', async () => {
    const wasteTrackingId = 'test-id'
    const updateData = {
      receipt: { test: 'data' },
      apiCode: apiCode2,
      orgId: orgId2
    }
    const existingWasteInput = {
      _id: wasteTrackingId,
      someData: 'value',
      apiCode: apiCode1,
      orgId: orgId1
    }
    const auditSpy = jest.spyOn(cdpAuditing, 'audit')

    await wasteInputsCollection.insertOne(existingWasteInput)

    const result = await updateWasteInput(
      db,
      wasteTrackingId,
      updateData,
      client,
      requestTraceId
    )

    expect(result).toBeInstanceOf(ValidationError)
    expect(result.key).toEqual('apiCode')
    expect(result.message).toEqual(
      'the API Code supplied does not relate to the same Organisation as created the original waste item record'
    )

    expect(auditSpy).not.toHaveBeenCalled()
  })
})
