import { createWasteInput } from './movement-create.js'

describe('createWasteInput', () => {
  let mockDb
  let mockCollection
  let mockInsertOne

  beforeEach(() => {
    // Setup mock collection and insertOne function
    mockInsertOne = jest.fn()
    mockCollection = {
      insertOne: mockInsertOne
    }
    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection)
    }
  })

  it('should create a movement and return it with the inserted ID', async () => {
    // Arrange
    const mockInsertedId = '123456789'
    const mockMovement = {
      wasteTrackingId: mockInsertedId
    }

    mockInsertOne.mockResolvedValueOnce({ insertedId: mockInsertedId })

    // Act
    const result = await createWasteInput(mockDb, mockMovement)

    // Assert
    expect(mockDb.collection).toHaveBeenCalledWith('waste-inputs')
    expect(mockInsertOne).toHaveBeenCalledWith(mockMovement)
    expect(mockMovement.createdAt).toBeInstanceOf(Date)
    expect(mockMovement.lastUpdatedAt).toBeInstanceOf(Date)
    expect(mockMovement.createdAt).toEqual(mockMovement.lastUpdatedAt)
    expect(result).toEqual({
      _id: mockInsertedId
    })
  })

  it('should handle database errors', async () => {
    // Arrange
    const mockMovement = {
      wasteTrackingId: '124453465'
    }
    const mockError = new Error('Database error')
    mockInsertOne.mockRejectedValueOnce(mockError)

    // Act & Assert
    await expect(createWasteInput(mockDb, mockMovement)).rejects.toThrow(
      mockError
    )
    expect(mockDb.collection).toHaveBeenCalledWith('waste-inputs')
    expect(mockInsertOne).toHaveBeenCalledWith(mockMovement)
    expect(mockMovement.createdAt).toBeInstanceOf(Date)
    expect(mockMovement.lastUpdatedAt).toBeInstanceOf(Date)
  })
})
