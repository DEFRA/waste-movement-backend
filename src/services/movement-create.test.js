import { createWasteInput } from './movement-create.js'
import * as exponentialBackoff from '../common/helpers/exponential-backoff-delay.js'

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

    await expect(createWasteInput(mockDb, mockMovement, 6)).rejects.toThrow(
      mockError.message
    )

    expect(mockDb.collection).toHaveBeenCalledWith('waste-inputs')
    expect(mockInsertOne).toHaveBeenCalledWith(mockMovement)
    expect(mockMovement.createdAt).toBeInstanceOf(Date)
    expect(mockMovement.lastUpdatedAt).toBeInstanceOf(Date)
  })

  it('should handle exponential backoff twice', async () => {
    const mockMovement = {
      wasteTrackingId: '124453465'
    }
    const mockError = new Error('Database error')

    mockDb = {
      collection: jest
        .fn()
        .mockImplementationOnce(() => {
          throw new Error(mockError)
        })
        .mockImplementationOnce(() => {
          throw new Error(mockError)
        })
        .mockImplementation(() => ({
          insertOne: () => ({ insertedId: 1 })
        }))
    }

    const calculateExponentialBackoffDelaySpy = jest.spyOn(
      exponentialBackoff,
      'calculateExponentialBackoffDelay'
    )

    await createWasteInput(mockDb, mockMovement)

    expect(calculateExponentialBackoffDelaySpy).toHaveBeenCalledWith(0)
    expect(calculateExponentialBackoffDelaySpy).toHaveBeenCalledWith(1)
    expect(calculateExponentialBackoffDelaySpy).toHaveBeenCalledTimes(2)
  }, 16000)
})
