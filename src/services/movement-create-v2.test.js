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

  it('should create an appropriate movement in the db and return just the id', async () => {
    const id = 'ourGeneratedId'
    const now = new Date().toISOString()
    const mockMovement = { id }

    const result = await createMovementRecord(db, mockMovement)

    const recordInDb = await movementsCollection.findOne({
      id
    })

    expect(result).toEqual({ id })

    expect(recordInDb).toEqual({
      _id: expect.any(Object),
      createdAt: now,
      id
    })
  })

  it('should handle database errors ', async () => {
    const id = 'ourGeneratedId'
    const mockMovement = { id }
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
