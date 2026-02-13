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
import * as cdpAuditing from '@defra/cdp-auditing'
import { AUDIT_LOGGER_TYPE } from '../common/constants/audit-logger.js'

jest.mock('@hapi/hoek', () => ({
  wait: jest.fn()
}))

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest
    .fn()
    .mockImplementationOnce(() => true)
    .mockImplementationOnce(() => true)
    .mockImplementation(() => {
      throw new Error('Internal Server Error')
    })
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

  it('should create multiple waste inputs and call audit log endpoint', async () => {
    const auditSpy = jest.spyOn(cdpAuditing, 'audit')

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

    expect(auditSpy).toHaveBeenCalledTimes(2)
    expect(auditSpy).toHaveBeenCalledWith({
      metadata: {
        type: AUDIT_LOGGER_TYPE.MOVEMENT_CREATED,
        traceId,
        version: 1
      },
      data: updatedWasteInput1
    })
    expect(auditSpy).toHaveBeenCalledWith({
      metadata: {
        type: AUDIT_LOGGER_TYPE.MOVEMENT_CREATED,
        traceId,
        version: 1
      },
      data: updatedWasteInput2
    })
  })

  it('should create multiple waste inputs and return success response when calling audit log endpoint fails', async () => {
    const auditSpy = jest.spyOn(cdpAuditing, 'audit')

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

    expect(auditSpy).toHaveBeenCalledTimes(2)
  })

  it('should throw an error and not call audit log endpooint if waste inputs with the same bulk id already exist', async () => {
    const auditSpy = jest.spyOn(cdpAuditing, 'audit')

    await wasteInputsCollection.insertMany(wasteInputs)

    await expect(
      createBulkWasteInput(db, mongoClient, wasteInputs)
    ).rejects.toThrow(
      `Failed to create waste inputs: Waste inputs with bulk id (${bulkId}) already exist`
    )

    expect(auditSpy).not.toHaveBeenCalled()
  })

  it('should throw an error and not call audit log endpoint if not all waste inputs have a waste tracking id and rollback changes', async () => {
    const auditSpy = jest.spyOn(cdpAuditing, 'audit')

    wasteInputs[1].wasteTrackingId = undefined

    await expect(
      createBulkWasteInput(db, mongoClient, wasteInputs)
    ).rejects.toThrow(
      `Failed to create waste inputs: Not all waste inputs with bulk id (${bulkId}) have a waste tracking id`
    )

    const results = await wasteInputsCollection.find().toArray()

    expect(results).toEqual([])

    expect(auditSpy).not.toHaveBeenCalled()
  })

  it('should database handle errors and not call audit log endpoint', async () => {
    const auditSpy = jest.spyOn(cdpAuditing, 'audit')

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

    expect(auditSpy).not.toHaveBeenCalled()
  })
})
