import { findMovementIds } from './movement.js'
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
})
