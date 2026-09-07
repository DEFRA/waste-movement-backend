import { createMovementRecord, findMovementIds } from './movement.js'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'

describe('movement', () => {
  let client
  let db
  let movementsCollection

  beforeAll(async () => {
    const testMongo = await createTestMongoDb()
    client = testMongo.client
    db = testMongo.db
  })

  afterAll(async () => {
    await client.close()
  })

  beforeEach(async () => {
    movementsCollection = db.collection('movements')
    await movementsCollection.deleteMany({})
  })

  describe('findMovementIds', () => {
    it('returns all movementIds that exist', async () => {
      await movementsCollection.insertMany([
        { movementId: '25HRA0B1' },
        { movementId: '25HRA0B2' }
      ])

      const result = await findMovementIds(db, ['25HRA0B1', '25HRA0B2'])

      expect(result).toEqual(['25HRA0B1', '25HRA0B2'])
    })

    it('omits movementIds that do not exist', async () => {
      await movementsCollection.insertOne({ movementId: '25HRA0B1' })

      const result = await findMovementIds(db, [
        '25HRA0B1',
        '25HRA0B2',
        '25HRA0B3'
      ])

      expect(result).toEqual(['25HRA0B1'])
    })

    it('returns an empty array when none exist', async () => {
      const result = await findMovementIds(db, ['25HRA0B1'])

      expect(result).toEqual([])
    })
  })

  describe('createMovementRecord', () => {
    beforeAll(() => {
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

    afterAll(() => {
      jest.clearAllTimers()
      jest.useRealTimers()
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
})
