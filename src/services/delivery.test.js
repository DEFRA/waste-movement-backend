import { createDeliveryId, createDeliveryRecord } from './delivery.js'
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
  let deliveriesCollection

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

  describe('createDeliveryRecord', () => {
    it('should create a delivery in the db and return the deliveryId', async () => {
      const deliveryId = '25KMT4Z9'
      const now = new Date().toISOString()
      const delivery = {
        deliveryId,
        movementIds: ['25HRA0B1'],
        orgId: '57aed195-325e-45d5-b1fb-5f201e0324cf'
      }

      const result = await createDeliveryRecord(db, delivery)

      const recordInDb = await deliveriesCollection.findOne({ deliveryId })

      expect(result).toEqual({ deliveryId })
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
})
