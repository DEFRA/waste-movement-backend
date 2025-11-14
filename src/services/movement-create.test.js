import { createWasteInput } from './movement-create.js'

describe('createWasteInput', () => {
  let mockDb
  let mockCollection
  let mockInsertOne

  beforeEach(() => {
    mockInsertOne = jest.fn()
    mockCollection = {
      insertOne: mockInsertOne
    }
    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection)
    }
  })

  it('should create a movement and return it with the inserted ID', async () => {
    const mockInsertedId = '123456789'
    const mockMovement = {
      wasteTrackingId: mockInsertedId
    }

    mockInsertOne.mockResolvedValueOnce({ insertedId: mockInsertedId })

    const result = await createWasteInput(mockDb, mockMovement)

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
    const mockMovement = {
      wasteTrackingId: '124453465'
    }
    const mockError = new Error('Database error')
    mockInsertOne.mockRejectedValueOnce(mockError)

    await expect(createWasteInput(mockDb, mockMovement)).rejects.toThrow(
      mockError.message
    )

    expect(mockDb.collection).toHaveBeenCalledWith('waste-inputs')
    expect(mockInsertOne).toHaveBeenCalledWith(mockMovement)
    expect(mockMovement.createdAt).toBeInstanceOf(Date)
    expect(mockMovement.lastUpdatedAt).toBeInstanceOf(Date)
  })
})
