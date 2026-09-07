import { createMovementRecord } from './movement-create-v2.js'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'

describe('createMovementRecord', () => {
  let client
  let db
  let movementsCollection

  beforeAll(async () => {
    const testMongo = await createTestMongoDb()
    client = testMongo.client
    db = testMongo.db

    jest.useFakeTimers({
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval'
      ]
    })
  })

  afterAll(async () => {
    await client.close()
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  beforeEach(async () => {
    movementsCollection = db.collection('movements')
    await movementsCollection.deleteMany({})
  })

  it('should create a movement in the db and return the movementId', async () => {
    const movementId = '25HRA0B2'
    const now = new Date().toISOString()
    const mockMovement = {
      movementId,
      orgId: '57aed195-325e-45d5-b1fb-5f201e0324cf'
    }

    const result = await createMovementRecord(db, mockMovement)

    const recordInDb = await movementsCollection.findOne({
      movementId
    })

    expect(result).toEqual({ movementId })

    expect(recordInDb).toEqual({
      _id: expect.any(Object),
      createdAt: now,
      ...mockMovement
    })
  })

  it('should handle database errors ', async () => {
    const movementId = '25HRA0B2'
    const mockMovement = { movementId }
    const mockError = new Error('Database error')

    await expect(
      createMovementRecord(
        {
          collection: jest.fn().mockImplementation(() => {
            throw mockError
          })
        },
        mockMovement
      )
    ).rejects.toThrow(mockError.message)
  })
})
