import {
  createDeliveryId,
  createDeliveryRecord,
  createDeliveryRecords,
  deliveryExists,
  findDeliveryMovementIds
} from './delivery.js'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import { httpClients } from '../common/helpers/http-client.js'

jest.mock('../common/helpers/http-client.js', () => ({
  httpClients: {
    wasteTracking: {
      get: jest.fn()
    }
  }
}))

describe('delivery', () => {
  let client
  let db
  let replicaSet
  let deliveriesCollection

  beforeAll(async () => {
    // A replica set, because createDeliveryRecords writes in a transaction.
    const testMongo = await createTestMongoDb(true)
    client = testMongo.client
    db = testMongo.db
    replicaSet = testMongo.replicaSet
    await db.createCollection('deliveries')

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
    await replicaSet?.stop()
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  beforeEach(async () => {
    deliveriesCollection = db.collection('deliveries')
    await deliveriesCollection.deleteMany({})
    httpClients.wasteTracking.get.mockReset()
  })

  describe('createDeliveryId', () => {
    it('returns the id minted by the waste tracking service', async () => {
      httpClients.wasteTracking.get.mockResolvedValue({
        payload: { wasteTrackingId: '25KMT4Z9' }
      })

      const result = await createDeliveryId()

      expect(result).toBe('25KMT4Z9')
      expect(httpClients.wasteTracking.get).toHaveBeenCalledWith('/next')
    })
  })

  describe('deliveryExists', () => {
    it('returns true when a delivery with the given id exists', async () => {
      const deliveryId = '25KMT4Z9'
      await deliveriesCollection.insertOne({ deliveryId })

      const result = await deliveryExists(db, deliveryId)

      expect(result).toBe(true)
    })

    it('returns false when no delivery with the given id exists', async () => {
      const result = await deliveryExists(db, '25KMT4Z9')

      expect(result).toBe(false)
    })
  })

  describe('findDeliveryMovementIds', () => {
    it('returns the movement ids delivered under the delivery id', async () => {
      await deliveriesCollection.insertOne({
        deliveryId: '25KMT4Z9',
        movementIds: ['25HRA0B2', '25HRA0B3']
      })

      const result = await findDeliveryMovementIds(db, '25KMT4Z9')

      expect(result).toEqual(['25HRA0B2', '25HRA0B3'])
    })

    it('combines and deduplicates every record with the delivery id', async () => {
      // A resubmitted hazardous movement stores a second record
      await deliveriesCollection.insertMany([
        { deliveryId: '25HRZ9X7', movementIds: ['25HRZ9X7'] },
        { deliveryId: '25HRZ9X7', movementIds: ['25HRZ9X7'] }
      ])

      const result = await findDeliveryMovementIds(db, '25HRZ9X7')

      expect(result).toEqual(['25HRZ9X7'])
    })

    it('returns an empty list when no delivery with the given id exists', async () => {
      const result = await findDeliveryMovementIds(db, '25KMT4Z9')

      expect(result).toEqual([])
    })
  })

  describe('createDeliveryRecord', () => {
    it('should create a delivery in the db and return the deliveryId', async () => {
      const deliveryId = '25KMT4Z9'
      const now = new Date().toISOString()
      const delivery = {
        deliveryId,
        movementIds: ['25HRA0B1'],
        wasteType: 'NON_HAZARDOUS',
        orgId: '57aed195-325e-45d5-b1fb-5f201e0324cf'
      }

      const result = await createDeliveryRecord(db, delivery)

      const recordInDb = await deliveriesCollection.findOne({ deliveryId })

      expect(result).toEqual({
        deliveryId,
        movementIds: delivery.movementIds,
        wasteType: delivery.wasteType
      })
      expect(recordInDb).toEqual({
        _id: expect.any(Object),
        createdAt: now,
        ...delivery
      })
    })

    it('should handle database errors', async () => {
      const mockError = new Error('Database error')

      await expect(
        createDeliveryRecord(
          {
            collection: jest.fn().mockImplementation(() => {
              throw mockError
            })
          },
          { deliveryId: '25KMT4Z9' }
        )
      ).rejects.toThrow(mockError.message)
    })
  })

  describe('createDeliveryRecords', () => {
    const orgId = '57aed195-325e-45d5-b1fb-5f201e0324cf'
    const deliveries = [
      {
        deliveryId: '25KMT4Z9',
        movementIds: ['25HRA0B1', '25HRA0B2'],
        wasteType: 'NON_HAZARDOUS',
        orgId
      },
      {
        deliveryId: '25HRA0B4',
        movementIds: ['25HRA0B4'],
        wasteType: 'HAZARDOUS',
        orgId
      },
      {
        deliveryId: '25HRA0B3',
        movementIds: ['25HRA0B3'],
        wasteType: 'HAZARDOUS',
        orgId
      }
    ]

    it('inserts every delivery and returns them in input order', async () => {
      const now = new Date().toISOString()

      const result = await createDeliveryRecords(db, client, deliveries)

      expect(result).toEqual(
        deliveries.map(({ deliveryId, movementIds, wasteType }) => ({
          deliveryId,
          movementIds,
          wasteType
        }))
      )

      const recordsInDb = await deliveriesCollection
        .find({}, { projection: { _id: 0 } })
        .toArray()

      expect(recordsInDb).toEqual(
        deliveries.map((delivery) => ({ ...delivery, createdAt: now }))
      )
    })

    describe('when a write fails part-way through the batch', () => {
      // Rejects the second delivery, after the first has been written.
      const setValidator = (validator) =>
        db.command({ collMod: 'deliveries', validator })

      beforeEach(() =>
        setValidator({ deliveryId: { $ne: deliveries[1].deliveryId } })
      )
      afterEach(() => setValidator({}))

      it('writes none of the deliveries', async () => {
        await expect(
          createDeliveryRecords(db, client, deliveries)
        ).rejects.toThrow()

        expect(await deliveriesCollection.countDocuments()).toBe(0)
      })

      it('leaves exactly one copy of each delivery once a retry succeeds', async () => {
        await expect(
          createDeliveryRecords(db, client, deliveries)
        ).rejects.toThrow()
        await setValidator({})

        await createDeliveryRecords(db, client, deliveries)

        const recordsInDb = await deliveriesCollection
          .find({}, { projection: { _id: 0, deliveryId: 1 } })
          .toArray()
        expect(recordsInDb).toEqual(
          deliveries.map(({ deliveryId }) => ({ deliveryId }))
        )
      })
    })

    it('should handle database errors', async () => {
      const mockError = new Error('Database error')

      await expect(
        createDeliveryRecords(
          {
            collection: jest.fn().mockImplementation(() => {
              throw mockError
            })
          },
          client,
          deliveries
        )
      ).rejects.toThrow(mockError.message)
    })
  })
})
