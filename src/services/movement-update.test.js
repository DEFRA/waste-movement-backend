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

const orgId1 = '57aed195-325e-45d5-b1fb-5f201e0324cf'
const orgId2 = '70d84972-2ad3-4ada-a867-ad261a7245e7'
const orgId3 = '7bbbe5a1a-82fa-48bf-bb8c-b516b8aa1ef4'

describe('updateWasteInput', () => {
  let client
  let db
  let wasteInputsCollection
  let wasteInputsHistoryCollection
  let invalidSubmissionsCollection
  let replicaSet

  const traceId = 'abc-def-123'

  beforeAll(async () => {
    const testMongo = await createTestMongoDb(true)
    client = testMongo.client
    db = testMongo.db
    replicaSet = testMongo.replicaSet
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
      submittingOrganisation: { defraCustomerOrganisationId: orgId1 }
    }
    const existingWasteInput = {
      _id: wasteTrackingId,
      someData: 'value',
      submittingOrganisation: { defraCustomerOrganisationId: orgId1 },
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
      traceId,
      undefined
    )

    const updatedWasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId
    })

    expect(updatedWasteInput.receipt).toEqual(updateData.receipt)
    expect(updatedWasteInput.revision).toEqual(2)
    expect(updatedWasteInput.traceId).toEqual(traceId)
    expect(updatedWasteInput.lastUpdatedAt).toBeInstanceOf(Date)

    const historyEntry = await wasteInputsHistoryCollection.findOne({
      wasteTrackingId
    })
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
      metadata: {
        type: AUDIT_LOGGER_TYPE.MOVEMENT_UPDATED,
        traceId,
        version: 1
      },
      data: updatedWasteInput
    })
  })

  it('should update waste input and calls audit endpoint when it exists and when fieldToUpdate is present', async () => {
    const wasteTrackingId = 'test-id'
    const updateData = {
      receipt: { test: 'data' },
      submittingOrganisation: { defraCustomerOrganisationId: orgId1 }
    }
    const existingWasteInput = {
      _id: wasteTrackingId,
      someData: 'value',
      submittingOrganisation: { defraCustomerOrganisationId: orgId1 },
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
      traceId,
      'receipt.movement'
    )

    const updatedWasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId
    })

    expect(updatedWasteInput.receipt.movement.receipt).toEqual(
      updateData.receipt
    )
    expect(updatedWasteInput.revision).toEqual(2)
    expect(updatedWasteInput.traceId).toEqual(traceId)
    expect(updatedWasteInput.lastUpdatedAt).toBeInstanceOf(Date)

    const historyEntry = await wasteInputsHistoryCollection.findOne({
      wasteTrackingId
    })
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
      metadata: {
        type: AUDIT_LOGGER_TYPE.MOVEMENT_UPDATED,
        traceId,
        version: 1
      },
      data: updatedWasteInput
    })
  })

  it('should update waste input with submittingOrganisation and calls audit endpoint', async () => {
    const wasteTrackingId = 'test-id'
    const updateData = {
      receipt: { test: 'data' },
      submittingOrganisation: { defraCustomerOrganisationId: orgId3 }
    }
    const existingWasteInput = {
      _id: wasteTrackingId,
      someData: 'value',
      submittingOrganisation: { defraCustomerOrganisationId: orgId3 },
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
      traceId,
      undefined
    )

    const updatedWasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId
    })

    expect(updatedWasteInput.submittingOrganisation).toEqual({
      defraCustomerOrganisationId: orgId3
    })
    expect(updatedWasteInput.revision).toEqual(2)
    expect(updatedWasteInput.traceId).toEqual(traceId)
    expect(updatedWasteInput.lastUpdatedAt).toBeInstanceOf(Date)

    const historyEntry = await wasteInputsHistoryCollection.findOne({
      wasteTrackingId
    })
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
      metadata: {
        type: AUDIT_LOGGER_TYPE.MOVEMENT_UPDATED,
        traceId,
        version: 1
      },
      data: updatedWasteInput
    })
  })

  it('should update waste input and return success response when calling audit endpoint fails', async () => {
    const wasteTrackingId = 'test-id'
    const updateData = {
      receipt: { test: 'data' },
      submittingOrganisation: { defraCustomerOrganisationId: orgId1 }
    }
    const existingWasteInput = {
      _id: wasteTrackingId,
      someData: 'value',
      submittingOrganisation: { defraCustomerOrganisationId: orgId1 },
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
      traceId,
      undefined
    )

    const updatedWasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId
    })

    expect(updatedWasteInput.revision).toEqual(2)
    expect(updatedWasteInput.traceId).toEqual(traceId)
    expect(updatedWasteInput.lastUpdatedAt).toBeInstanceOf(Date)

    const historyEntry = await wasteInputsHistoryCollection.findOne({
      wasteTrackingId
    })
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
      submittingOrganisation: { defraCustomerOrganisationId: orgId1 }
    }
    const auditSpy = jest.spyOn(cdpAuditing, 'audit')

    const result = await updateWasteInput(
      db,
      wasteTrackingId,
      updateData,
      client,
      traceId,
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
      submittingOrganisation: { defraCustomerOrganisationId: orgId1 }
    }
    const existingWasteInput = {
      _id: wasteTrackingId,
      someData: 'value',
      revision: 1,
      submittingOrganisation: { defraCustomerOrganisationId: orgId1 }
    }

    await wasteInputsCollection.insertOne(existingWasteInput)

    const result = await updateWasteInput(
      db,
      wasteTrackingId,
      updateData,
      client,
      traceId,
      undefined
    )

    const updatedWasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId
    })
    expect(updatedWasteInput.revision).toEqual(2)
    expect(updatedWasteInput.traceId).toEqual(traceId)
    expect(updatedWasteInput.lastUpdatedAt).toBeInstanceOf(Date)

    const historyEntry = await wasteInputsHistoryCollection.findOne({
      wasteTrackingId
    })

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
        traceId,
        'receipt.movement'
      )
    ).rejects.toThrow(mockError.message)

    expect(auditSpy).not.toHaveBeenCalled()
  })

  it('should return a validation error and not call audit endpoint if the submitting organisation does not match the original record', async () => {
    const wasteTrackingId = 'test-id'
    const updateData = {
      receipt: { test: 'data' },
      submittingOrganisation: { defraCustomerOrganisationId: orgId2 }
    }
    const existingWasteInput = {
      _id: wasteTrackingId,
      someData: 'value',
      submittingOrganisation: { defraCustomerOrganisationId: orgId1 }
    }
    const auditSpy = jest.spyOn(cdpAuditing, 'audit')

    await wasteInputsCollection.insertOne(existingWasteInput)

    const result = await updateWasteInput(
      db,
      wasteTrackingId,
      updateData,
      client,
      traceId
    )

    expect(result).toBeInstanceOf(ValidationError)
    expect(result.key).toEqual('submittingOrganisation')
    expect(result.message).toEqual(
      'the submitting organisation does not match the Organisation that created the original waste item record'
    )

    expect(auditSpy).not.toHaveBeenCalled()
  })
})
