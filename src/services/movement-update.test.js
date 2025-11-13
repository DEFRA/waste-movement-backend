import { MongoClient } from 'mongodb'
import { updateWasteInput } from './movement-update.js'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from '@jest/globals'
import * as exponentialBackoff from '../common/helpers/exponential-backoff-delay.js'

describe('updateWasteInput', () => {
  let client
  let db
  let wasteInputsCollection
  let wasteInputsHistoryCollection
  let invalidSubmissionsCollection

  beforeAll(async () => {
    client = new MongoClient(process.env.MONGO_URI)
    await client.connect()
    db = client.db()
  })

  afterAll(async () => {
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
    const updateData = { receipt: { test: 'data' } }
    const existingWasteInput = { _id: wasteTrackingId, someData: 'value' }

    await wasteInputsCollection.insertOne(existingWasteInput)

    const result = await updateWasteInput(db, wasteTrackingId, updateData)

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
    const updateData = { receipt: { test: 'data' } }
    const existingWasteInput = { _id: wasteTrackingId, someData: 'value' }

    await wasteInputsCollection.insertOne(existingWasteInput)

    const result = await updateWasteInput(
      db,
      wasteTrackingId,
      updateData,
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
    const updateData = { receipt: { test: 'data' } }

    const result = await updateWasteInput(db, wasteTrackingId, updateData)

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
    const updateData = { receipt: { test: 'updated-data' } }
    const existingWasteInput = {
      _id: wasteTrackingId,
      someData: 'value',
      revision: 1
    }

    await wasteInputsCollection.insertOne(existingWasteInput)

    const result = await updateWasteInput(db, wasteTrackingId, updateData)

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
      updateWasteInput(mockDb, 1, mockMovement, '', 6)
    ).rejects.toThrow(mockError.message)
  })

  it('should handle exponential backoff twice', async () => {
    const mockMovement = {
      wasteTrackingId: '124453465'
    }
    const mockError = new Error('Database error')
    const mockDb = {
      collection: jest
        .fn()
        .mockImplementationOnce(() => {
          throw new Error(mockError)
        })
        .mockImplementationOnce(() => {
          throw new Error(mockError)
        })
        .mockImplementation(() => ({
          findOne: () => true,
          insertOne: () => ({ insertedId: 1 }),
          updateOne: () => ({ matchedCount: 1, modifiedCount: 1 })
        }))
    }
    const calculateExponentialBackoffDelaySpy = jest.spyOn(
      exponentialBackoff,
      'calculateExponentialBackoffDelay'
    )

    await updateWasteInput(mockDb, 1, mockMovement, '')

    expect(calculateExponentialBackoffDelaySpy).toHaveBeenCalledWith(0)
    expect(calculateExponentialBackoffDelaySpy).toHaveBeenCalledWith(1)
    expect(calculateExponentialBackoffDelaySpy).toHaveBeenCalledTimes(2)
  })
})
