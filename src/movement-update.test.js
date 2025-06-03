import { updateWasteInput } from './movement-update.js'

describe('updateWasteInput', () => {
  let mockDb
  let mockCollection
  let mockUpdateOne

  beforeEach(() => {
    // Setup mock collection and updateOne function
    mockUpdateOne = jest.fn()
    mockCollection = {
      updateOne: mockUpdateOne
    }
    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection)
    }
  })

  it('should update a waste input and return the result', async () => {
    // Arrange
    const mockWasteTrackingId = '123456789'
    const mockUpdateData = {
      receipt: { movement: { waste: [] } }
    }
    const mockResult = {
      matchedCount: 1,
      modifiedCount: 1
    }

    mockUpdateOne.mockResolvedValueOnce(mockResult)

    // Act
    const result = await updateWasteInput(
      mockDb,
      mockWasteTrackingId,
      mockUpdateData
    )

    // Assert
    expect(mockDb.collection).toHaveBeenCalledWith('waste-inputs')
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: mockWasteTrackingId },
      { $set: mockUpdateData }
    )
    expect(result).toEqual({
      matchedCount: 1,
      modifiedCount: 1
    })
  })

  it('should return zero counts when no document matches', async () => {
    // Arrange
    const mockWasteTrackingId = 'nonexistent-id'
    const mockUpdateData = {
      receipt: { movement: { waste: [] } }
    }
    const mockResult = {
      matchedCount: 0,
      modifiedCount: 0
    }

    mockUpdateOne.mockResolvedValueOnce(mockResult)

    // Act
    const result = await updateWasteInput(
      mockDb,
      mockWasteTrackingId,
      mockUpdateData
    )

    // Assert
    expect(mockDb.collection).toHaveBeenCalledWith('waste-inputs')
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: mockWasteTrackingId },
      { $set: mockUpdateData }
    )
    expect(result).toEqual({
      matchedCount: 0,
      modifiedCount: 0
    })
  })

  it('should handle database errors', async () => {
    // Arrange
    const mockWasteTrackingId = '123456789'
    const mockUpdateData = {
      receipt: { movement: { waste: [] } }
    }
    const mockError = new Error('Database error')
    mockUpdateOne.mockRejectedValueOnce(mockError)

    // Act & Assert
    await expect(
      updateWasteInput(mockDb, mockWasteTrackingId, mockUpdateData)
    ).rejects.toThrow(mockError)
    expect(mockDb.collection).toHaveBeenCalledWith('waste-inputs')
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: mockWasteTrackingId },
      { $set: mockUpdateData }
    )
  })
})
