import {
  createMovementRecord,
  findMovementIds,
  getMovementRecord
} from './movement.js'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'

describe('movement service', () => {
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

  describe('createMovementRecord', () => {
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

  describe('getMovementRecord', () => {
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

    it('should get a movement with the given movementId ', async () => {
      const id = 'ourGeneratedId'
      const now = new Date().toISOString()
      const mockMovement = { id }

      const result = await createMovementRecord(db, mockMovement)

      const recordInDb = await getMovementRecord(db, id)

      expect(result).toEqual({ id })

      expect(recordInDb).toEqual({
        _id: expect.any(Object),
        createdAt: now,
        id
      })
    })

    it('should return null when a movmentId is not found', async () => {
      const id = 'nonExistentId'
      const recordInDb = await getMovementRecord(db, id)

      expect(recordInDb).toBeNull()
    })

    it('should handle database errors ', async () => {
      const id = 'ourGeneratedId'
      const mockMovementId = id
      const mockError = new Error('Database error')

      await expect(
        getMovementRecord(
          {
            collection: jest.fn().mockImplementation(() => {
              throw mockError
            })
          },
          mockMovementId
        )
      ).rejects.toThrow(mockError.message)
    })
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
})
