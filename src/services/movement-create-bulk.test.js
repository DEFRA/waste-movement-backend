import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from '@jest/globals'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import { base64EncodedOrgApiCodes, orgId1 } from '../test/data/apiCodes.js'
import { config } from '../config.js'
import { createBulkWasteInput } from './movement-create-bulk.js'

jest.mock('@hapi/hoek', () => ({
  wait: jest.fn()
}))

describe('#createBulkWasteInput', () => {
  let mongoClient
  let db
  let wasteInputsCollection
  let wasteInputsHistoryCollection
  let replicaSet
  let wasteInputs

  const traceId = 'abc-def-123'
  const bulkId = 'fccbd30d-3082-494d-b470-15b13a7bbaa8'

  beforeAll(async () => {
    const testMongo = await createTestMongoDb(true)
    mongoClient = testMongo.client
    db = testMongo.db
    replicaSet = testMongo.replicaSet
    config.set('orgApiCodes', base64EncodedOrgApiCodes)
  })

  afterAll(async () => {
    if (replicaSet) {
      await replicaSet.stop()
    }
    await mongoClient.close()
  })

  beforeEach(async () => {
    wasteInputs = [
      {
        wasteTrackingId: '26E4C7Z2',
        receipt: {},
        createdAt: new Date(),
        lastUpdatedAt: new Date(),
        orgId: orgId1,
        traceId,
        bulkId,
        revision: 1
      },
      {
        wasteTrackingId: '266XHTDL',
        receipt: {},
        createdAt: new Date(),
        lastUpdatedAt: new Date(),
        orgId: orgId1,
        traceId,
        bulkId,
        revision: 1
      }
    ]

    wasteInputsCollection = db.collection('waste-inputs')
    wasteInputsHistoryCollection = db.collection('waste-inputs-history')

    await wasteInputsCollection.deleteMany({})
    await wasteInputsHistoryCollection.deleteMany({})
  })

  it('should create multiple waste inputs', async () => {
    const result = await createBulkWasteInput(db, mongoClient, wasteInputs)

    expect(result).toEqual([
      { wasteTrackingId: '26E4C7Z2' },
      { wasteTrackingId: '266XHTDL' }
    ])

    const updatedWasteInput1 = await wasteInputsCollection.findOne({
      _id: '26E4C7Z2'
    })

    expect(updatedWasteInput1).toEqual(wasteInputs[0])

    const updatedWasteInput2 = await wasteInputsCollection.findOne({
      _id: '266XHTDL'
    })

    expect(updatedWasteInput2).toEqual(wasteInputs[1])
  })

  it('should throw an error if waste inputs with the same bulk id already exist', async () => {
    await wasteInputsCollection.insertMany(wasteInputs)

    await expect(
      createBulkWasteInput(db, mongoClient, wasteInputs)
    ).rejects.toThrow(
      `Failed to create waste inputs: Waste inputs with bulk id (${bulkId}) already exist`
    )
  })

  it('should throw an error if not all waste inputs have a waste tracking id and rollback changes', async () => {
    wasteInputs[1].wasteTrackingId = undefined

    await expect(
      createBulkWasteInput(db, mongoClient, wasteInputs)
    ).rejects.toThrow(
      `Failed to create waste inputs: Not all waste inputs with bulk id (${bulkId}) have a waste tracking id`
    )

    const results = await wasteInputsCollection.find().toArray()

    expect(results).toEqual([])
  })

  it('should database handle errors', async () => {
    const mockError = new Error('Database error')
    const mockDb = {
      collection: jest.fn().mockReturnValue({
        insertOne: jest
          .fn()
          .mockResolvedValueOnce({ insertedId: '26E4C7Z2' })
          .mockRejectedValueOnce(mockError),
        findOne: jest.fn().mockResolvedValue(null)
      })
    }

    await expect(
      createBulkWasteInput(mockDb, mongoClient, wasteInputs)
    ).rejects.toThrow(mockError)
  })
})
