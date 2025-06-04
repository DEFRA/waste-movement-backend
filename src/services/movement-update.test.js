import { updateWasteInput } from './movement-update.js'

describe('updateWasteInput', () => {
  let mockDb
  let mockWasteInputsCollection
  let mockWasteInputsHistoryCollection
  let mockInvalidSubmissionsCollection

  beforeEach(() => {
    mockWasteInputsCollection = {
      findOne: jest.fn(),
      updateOne: jest
        .fn()
        .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 })
    }
    mockWasteInputsHistoryCollection = {
      insertOne: jest.fn().mockResolvedValue({})
    }
    mockInvalidSubmissionsCollection = {
      insertOne: jest.fn().mockResolvedValue({})
    }

    mockDb = {
      collection: jest.fn((name) => {
        if (name === 'waste-inputs') return mockWasteInputsCollection
        if (name === 'waste-inputs-history') {
          return mockWasteInputsHistoryCollection
        }
        if (name === 'invalid-submissions') {
          return mockInvalidSubmissionsCollection
        }
        return null
      })
    }
  })

  it('should update waste input when it exists', async () => {
    const wasteTrackingId = 'test-id'
    const updateData = { receipt: { test: 'data' } }
    const existingWasteInput = { _id: wasteTrackingId, someData: 'value' }

    mockWasteInputsCollection.findOne.mockResolvedValue(existingWasteInput)

    const result = await updateWasteInput(mockDb, wasteTrackingId, updateData)

    expect(mockDb.collection).toHaveBeenCalledWith('waste-inputs')
    expect(mockDb.collection).toHaveBeenCalledWith('waste-inputs-history')
    expect(mockDb.collection).toHaveBeenCalledWith('invalid-submissions')

    expect(mockWasteInputsCollection.findOne).toHaveBeenCalledWith({
      _id: wasteTrackingId
    })

    const historyEntry = {
      ...existingWasteInput,
      wasteTrackingId,
      timestamp: expect.any(Date)
    }

    expect(mockWasteInputsHistoryCollection.insertOne).toHaveBeenCalledWith(
      historyEntry
    )

    expect(mockWasteInputsCollection.updateOne).toHaveBeenCalledWith(
      { _id: wasteTrackingId },
      {
        $set: updateData,
        $inc: { revision: 1 }
      }
    )

    expect(result).toEqual({
      matchedCount: 1,
      modifiedCount: 1
    })
  })

  it('should create invalid submission when waste input does not exist', async () => {
    const wasteTrackingId = 'non-existent-id'
    const updateData = { receipt: { test: 'data' } }

    mockWasteInputsCollection.findOne.mockResolvedValue(null)

    const result = await updateWasteInput(mockDb, wasteTrackingId, updateData)

    expect(mockDb.collection).toHaveBeenCalledWith('waste-inputs')
    expect(mockDb.collection).toHaveBeenCalledWith('waste-inputs-history')
    expect(mockDb.collection).toHaveBeenCalledWith('invalid-submissions')

    expect(mockWasteInputsCollection.findOne).toHaveBeenCalledWith({
      _id: wasteTrackingId
    })
    expect(mockInvalidSubmissionsCollection.insertOne).toHaveBeenCalledWith({
      wasteTrackingId,
      updateData,
      timestamp: expect.any(Date),
      reason: 'Waste input not found'
    })

    expect(mockWasteInputsCollection.updateOne).not.toHaveBeenCalled()
    expect(mockWasteInputsHistoryCollection.insertOne).not.toHaveBeenCalled()

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

    mockWasteInputsCollection.findOne.mockResolvedValue(existingWasteInput)

    const result = await updateWasteInput(mockDb, wasteTrackingId, updateData)

    expect(mockWasteInputsCollection.findOne).toHaveBeenCalledWith({
      _id: wasteTrackingId
    })

    const historyEntry = {
      ...existingWasteInput,
      wasteTrackingId,
      timestamp: expect.any(Date)
    }

    expect(mockWasteInputsHistoryCollection.insertOne).toHaveBeenCalledWith(
      historyEntry
    )

    expect(mockWasteInputsCollection.updateOne).toHaveBeenCalledWith(
      { _id: wasteTrackingId },
      {
        $set: updateData,
        $inc: { revision: 3 }
      }
    )

    expect(result).toEqual({
      matchedCount: 1,
      modifiedCount: 1
    })
  })
})
