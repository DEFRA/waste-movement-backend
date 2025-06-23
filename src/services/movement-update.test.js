import { MongoClient } from 'mongodb'
import { updateWasteInput } from './movement-update.js'

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

  it('should update waste input when it exists', async () => {
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

    const historyEntry = await wasteInputsHistoryCollection.findOne({
      wasteTrackingId
    })
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
      revision: 3 // Document already has revision 3
    }

    await wasteInputsCollection.insertOne(existingWasteInput)

    const result = await updateWasteInput(db, wasteTrackingId, updateData)

    const updatedWasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId
    })
    expect(updatedWasteInput).toMatchObject({
      ...existingWasteInput,
      ...updateData,
      revision: 6 // 3 + 3 = 6
    })

    const historyEntry = await wasteInputsHistoryCollection.findOne({
      wasteTrackingId
    })
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
})
