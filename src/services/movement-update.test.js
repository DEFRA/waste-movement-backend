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
  base64EncodedOrgApiCodes,
  orgId1
} from '../test/data/apiCodes.js'
import { config } from '../config.js'

jest.mock('@hapi/hoek', () => ({
  wait: jest.fn()
}))

describe('updateWasteInput', () => {
  let client
  let db
  let wasteInputsCollection
  let wasteInputsHistoryCollection
  let invalidSubmissionsCollection
  let replicaSet

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

  it('should update waste input when it exists and when fieldToUpdate is not present', async () => {
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
      orgId: orgId1
    }

    await wasteInputsCollection.insertOne(existingWasteInput)

    const result = await updateWasteInput(
      db,
      wasteTrackingId,
      updateData,
      client,
      undefined
    )

    const updatedWasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId
    })

    expect(updatedWasteInput).toMatchObject({
      ...existingWasteInput,
      ...updateData,
      revision: 1
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

  it('should update waste input when it exists and when fieldToUpdate is present', async () => {
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
      orgId: orgId1
    }

    await wasteInputsCollection.insertOne(existingWasteInput)

    const result = await updateWasteInput(
      db,
      wasteTrackingId,
      updateData,
      client,
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
      revision: 1
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

  it('should create invalid submission when waste input does not exist', async () => {
    const wasteTrackingId = 'non-existent-id'
    const updateData = {
      receipt: { test: 'data' },
      apiCode: apiCode1,
      orgId: orgId1
    }

    const result = await updateWasteInput(
      db,
      wasteTrackingId,
      updateData,
      client,
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

  it('should handle database errors', async () => {
    const mockMovement = {
      wasteTrackingId: '124453465'
    }
    const mockError = new Error('Database error')
    const mockDb = {
      collection: () => ({
        findOne: jest.fn().mockRejectedValueOnce(mockError)
      })
    }

    await expect(
      updateWasteInput(mockDb, 1, mockMovement, client, 'receipt.movement')
    ).rejects.toThrow(mockError.message)
  })
})
