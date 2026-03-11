import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest
} from '@jest/globals'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import { base64EncodedOrgApiCodes, orgId1 } from '../test/data/apiCodes.js'
import { config } from '../config.js'
import { updateBulkWasteInput } from './movement-update-bulk.js'
import * as cdpAuditing from '@defra/cdp-auditing'
import { AUDIT_LOGGER_TYPE } from '../common/constants/audit-logger.js'
import { createBulkMovementRequest } from '../test/utils/createBulkMovementRequest.js'

jest.mock('@hapi/hoek', () => ({
  wait: jest.fn()
}))

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockReturnValue(true)
}))

describe('#updateBulkWasteInput', () => {
  let mongoClient
  let db
  let wasteInputsCollection
  let wasteInputsHistoryCollection
  let replicaSet
  let existingWasteInputs

  const traceId = 'abc-def-123'
  const bulkId = 'fccbd30d-3082-494d-b470-15b13a7bbaa8'
  const updateBulkId = 'a1b2c3d4-5678-9012-3456-789012345678'
  const bulkMovementRequest = createBulkMovementRequest()

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
    wasteInputsCollection = db.collection('waste-inputs')
    wasteInputsHistoryCollection = db.collection('waste-inputs-history')

    await wasteInputsCollection.deleteMany({})
    await wasteInputsHistoryCollection.deleteMany({})

    existingWasteInputs = [
      {
        _id: '26E4C7Z2',
        wasteTrackingId: '26E4C7Z2',
        receipt: {},
        createdAt: new Date(),
        lastUpdatedAt: new Date(),
        orgId: orgId1,
        traceId,
        bulkId,
        revision: 1,
        submittingOrganisation: bulkMovementRequest.submittingOrganisation
      },
      {
        _id: '266XHTDL',
        wasteTrackingId: '266XHTDL',
        receipt: {},
        createdAt: new Date(),
        lastUpdatedAt: new Date(),
        orgId: orgId1,
        traceId,
        bulkId,
        revision: 1,
        submittingOrganisation: bulkMovementRequest.submittingOrganisation
      }
    ]

    await wasteInputsCollection.insertMany(existingWasteInputs)
  })

  it('should update multiple waste inputs', async () => {
    const payload = [
      { ...createBulkMovementRequest(), wasteTrackingId: '26E4C7Z2' },
      { ...createBulkMovementRequest(), wasteTrackingId: '266XHTDL' }
    ]

    const result = await updateBulkWasteInput(
      db,
      mongoClient,
      payload,
      updateBulkId,
      traceId,
      existingWasteInputs
    )

    expect(result).toEqual([{}, {}])

    const updatedWasteInput1 = await wasteInputsCollection.findOne({
      _id: '26E4C7Z2'
    })

    expect(updatedWasteInput1.revision).toEqual(2)
    expect(updatedWasteInput1.receipt).toEqual({
      movement: {
        ...payload[0],
        submittingOrganisation: undefined
      }
    })
    expect(updatedWasteInput1.bulkId).toEqual(updateBulkId)
    expect(updatedWasteInput1.submittingOrganisation).toEqual(
      bulkMovementRequest.submittingOrganisation
    )

    const updatedWasteInput2 = await wasteInputsCollection.findOne({
      _id: '266XHTDL'
    })

    expect(updatedWasteInput2.revision).toEqual(2)
    expect(updatedWasteInput2.receipt).toEqual({
      movement: {
        ...payload[1],
        submittingOrganisation: undefined
      }
    })
    expect(updatedWasteInput2.bulkId).toEqual(updateBulkId)

    expect(updatedWasteInput2.submittingOrganisation).toEqual(
      bulkMovementRequest.submittingOrganisation
    )
  })

  it('should create history entries for each updated movement', async () => {
    const payload = [
      { wasteTrackingId: '26E4C7Z2' },
      { wasteTrackingId: '266XHTDL' }
    ]

    await updateBulkWasteInput(
      db,
      mongoClient,
      payload,
      updateBulkId,
      traceId,
      existingWasteInputs
    )

    const historyEntries = await wasteInputsHistoryCollection.find().toArray()

    expect(historyEntries).toHaveLength(2)
    expect(historyEntries[0].wasteTrackingId).toEqual('26E4C7Z2')
    expect(historyEntries[0].revision).toEqual(1)
    expect(historyEntries[1].wasteTrackingId).toEqual('266XHTDL')
    expect(historyEntries[1].revision).toEqual(1)
  })

  it('should return null if waste inputs with the same bulk id have already been updated', async () => {
    const payload = [
      { wasteTrackingId: '26E4C7Z2' },
      { wasteTrackingId: '266XHTDL' }
    ]

    await updateBulkWasteInput(
      db,
      mongoClient,
      payload,
      updateBulkId,
      traceId,
      existingWasteInputs
    )

    // Re-fetch existing waste inputs with updated revisions
    const refreshedWasteInputs = await Promise.all(
      payload.map((item) =>
        wasteInputsCollection.findOne({ _id: item.wasteTrackingId })
      )
    )

    const result = await updateBulkWasteInput(
      db,
      mongoClient,
      payload,
      updateBulkId,
      traceId,
      refreshedWasteInputs
    )

    expect(result).toBeNull()
  })

  it('should rollback all changes when one update fails', async () => {
    const payload = [
      { wasteTrackingId: '26E4C7Z2' },
      { wasteTrackingId: '266XHTDL' }
    ]

    // Set a wrong revision on the second item to trigger a concurrent update error
    const badExistingWasteInputs = [
      existingWasteInputs[0],
      { ...existingWasteInputs[1], revision: 99 }
    ]

    await expect(
      updateBulkWasteInput(
        db,
        mongoClient,
        payload,
        updateBulkId,
        traceId,
        badExistingWasteInputs
      )
    ).rejects.toThrow(
      'Failed to update waste inputs: Concurrent update detected for waste tracking id (266XHTDL)'
    )

    // Verify rollback - revisions should still be 1
    const wasteInput1 = await wasteInputsCollection.findOne({
      _id: '26E4C7Z2'
    })
    expect(wasteInput1.revision).toEqual(1)

    const wasteInput2 = await wasteInputsCollection.findOne({
      _id: '266XHTDL'
    })
    expect(wasteInput2.revision).toEqual(1)

    // Verify no history entries were persisted
    const historyEntries = await wasteInputsHistoryCollection.find().toArray()
    expect(historyEntries).toEqual([])
  })

  it('should handle database errors', async () => {
    const payload = [{ wasteTrackingId: '26E4C7Z2' }]

    const mockError = new Error('Database error')
    const mockDb = {
      collection: jest.fn().mockReturnValue({
        findOne: jest.fn().mockRejectedValue(mockError),
        insertOne: jest.fn().mockRejectedValue(mockError),
        updateOne: jest.fn().mockRejectedValue(mockError)
      })
    }

    await expect(
      updateBulkWasteInput(
        mockDb,
        mongoClient,
        payload,
        updateBulkId,
        traceId,
        existingWasteInputs
      )
    ).rejects.toThrow(mockError)
  })

  it('should call audit logger for each updated waste input', async () => {
    const payload = [
      { wasteTrackingId: '26E4C7Z2' },
      { wasteTrackingId: '266XHTDL' }
    ]

    const auditSpy = jest.spyOn(cdpAuditing, 'audit')

    await updateBulkWasteInput(
      db,
      mongoClient,
      payload,
      updateBulkId,
      traceId,
      existingWasteInputs
    )

    expect(auditSpy).toHaveBeenCalledTimes(2)

    const updatedWasteInput1 = await wasteInputsCollection.findOne({
      _id: '26E4C7Z2'
    })
    const updatedWasteInput2 = await wasteInputsCollection.findOne({
      _id: '266XHTDL'
    })

    expect(auditSpy).toHaveBeenCalledWith({
      metadata: {
        type: AUDIT_LOGGER_TYPE.MOVEMENT_UPDATED,
        traceId,
        version: 1
      },
      data: updatedWasteInput1
    })
    expect(auditSpy).toHaveBeenCalledWith({
      metadata: {
        type: AUDIT_LOGGER_TYPE.MOVEMENT_UPDATED,
        traceId,
        version: 1
      },
      data: updatedWasteInput2
    })
  })

  it('should not call audit logger when alreadyUpdated is true', async () => {
    const payload = [
      { wasteTrackingId: '26E4C7Z2' },
      { wasteTrackingId: '266XHTDL' }
    ]

    await updateBulkWasteInput(
      db,
      mongoClient,
      payload,
      updateBulkId,
      traceId,
      existingWasteInputs
    )

    const auditSpy = jest.spyOn(cdpAuditing, 'audit')
    auditSpy.mockClear()

    const refreshedWasteInputs = await Promise.all(
      payload.map((item) =>
        wasteInputsCollection.findOne({ _id: item.wasteTrackingId })
      )
    )

    const result = await updateBulkWasteInput(
      db,
      mongoClient,
      payload,
      updateBulkId,
      traceId,
      refreshedWasteInputs
    )

    expect(result).toBeNull()
    expect(auditSpy).not.toHaveBeenCalled()
  })

  it('should return success even when audit logger fails', async () => {
    const payload = [{ wasteTrackingId: '26E4C7Z2' }]

    const auditSpy = jest.spyOn(cdpAuditing, 'audit')
    auditSpy.mockImplementation(() => {
      throw new Error('Audit endpoint unavailable')
    })

    const result = await updateBulkWasteInput(
      db,
      mongoClient,
      payload,
      updateBulkId,
      traceId,
      [existingWasteInputs[0]]
    )

    expect(result).toEqual([{}])
    expect(auditSpy).toHaveBeenCalledTimes(1)
  })
})
