import {
  createReservationBatch,
  getReservation,
  countOutstandingReservations,
  markReservationUsed,
  isReservationExpired,
  effectiveReservationState,
  RESERVATION_STATUS,
  DEFAULT_OUTSTANDING_CAP
} from './reservation.js'
import { createTestMongoDb } from '../test/create-test-mongo-db.js'
import { httpClients } from '../common/helpers/http-client.js'
import { orgId1 } from '../test/data/apiCodes.js'

jest.mock('../common/helpers/http-client.js', () => ({
  httpClients: {
    wasteTracking: {
      get: jest.fn()
    }
  }
}))

describe('reservation', () => {
  let client
  let db
  let reservationsCollection
  let idCounter

  beforeAll(async () => {
    const testMongo = await createTestMongoDb()
    client = testMongo.client
    db = testMongo.db
  })

  afterAll(async () => {
    await client.close()
  })

  beforeEach(async () => {
    reservationsCollection = db.collection('id-reservations')
    await reservationsCollection.deleteMany({})
    httpClients.wasteTracking.get.mockReset()

    idCounter = 0
    httpClients.wasteTracking.get.mockImplementation(() => {
      idCounter += 1
      return Promise.resolve({
        payload: { wasteTrackingId: `25MINT${idCounter}` }
      })
    })
  })

  describe('createReservationBatch', () => {
    it('mints a batch of reservations drawn from GET /next', async () => {
      const { reservations, replay, outstanding, cap } =
        await createReservationBatch(db, {
          orgId: orgId1,
          clientId: 'client-1',
          count: 3,
          idempotencyKey: 'key-1'
        })

      expect(replay).toBe(false)
      expect(reservations).toHaveLength(3)
      expect(httpClients.wasteTracking.get).toHaveBeenCalledTimes(3)
      expect(outstanding).toBe(3)
      expect(cap).toBe(DEFAULT_OUTSTANDING_CAP)

      reservations.forEach((reservation) => {
        expect(reservation).toMatchObject({
          orgId: orgId1,
          reservedByClientId: 'client-1',
          status: RESERVATION_STATUS.RESERVED,
          idempotencyKey: 'key-1'
        })
      })

      const stored = await reservationsCollection.countDocuments({
        orgId: orgId1
      })
      expect(stored).toBe(3)
    })

    it('replays an identical request instead of minting again', async () => {
      const first = await createReservationBatch(db, {
        orgId: orgId1,
        clientId: 'client-1',
        count: 2,
        idempotencyKey: 'key-replay'
      })

      httpClients.wasteTracking.get.mockClear()

      const second = await createReservationBatch(db, {
        orgId: orgId1,
        clientId: 'client-1',
        count: 2,
        idempotencyKey: 'key-replay'
      })

      expect(httpClients.wasteTracking.get).not.toHaveBeenCalled()
      expect(second.replay).toBe(true)
      expect(second.replayConflict).toBe(false)
      expect(second.reservations.map((r) => r.deliveryId)).toEqual(
        first.reservations.map((r) => r.deliveryId)
      )
    })

    it('flags a conflict when the same key is replayed with a different count', async () => {
      await createReservationBatch(db, {
        orgId: orgId1,
        clientId: 'client-1',
        count: 2,
        idempotencyKey: 'key-conflict'
      })

      const result = await createReservationBatch(db, {
        orgId: orgId1,
        clientId: 'client-1',
        count: 5,
        idempotencyKey: 'key-conflict'
      })

      expect(result.replay).toBe(true)
      expect(result.replayConflict).toBe(true)
    })

    it('refuses a batch that would exceed the outstanding cap', async () => {
      const result = await createReservationBatch(db, {
        orgId: orgId1,
        clientId: 'client-1',
        count: DEFAULT_OUTSTANDING_CAP + 1,
        idempotencyKey: 'key-over-cap'
      })

      expect(result.quotaExceeded).toBe(true)
      expect(result.reservations).toEqual([])
      expect(httpClients.wasteTracking.get).not.toHaveBeenCalled()
    })
  })

  describe('getReservation / countOutstandingReservations', () => {
    it('finds a reservation by Delivery ID and counts outstanding ones', async () => {
      const { reservations } = await createReservationBatch(db, {
        orgId: orgId1,
        clientId: 'client-1',
        count: 2,
        idempotencyKey: 'key-count'
      })

      const found = await getReservation(db, reservations[0].deliveryId)
      expect(found).toMatchObject({ deliveryId: reservations[0].deliveryId })

      const outstanding = await countOutstandingReservations(db, orgId1)
      expect(outstanding).toBe(2)
    })

    it('returns null for an unknown Delivery ID', async () => {
      const found = await getReservation(db, 'unknown-id')
      expect(found).toBeNull()
    })
  })

  describe('markReservationUsed', () => {
    it('flips a reservation to used and records who used it', async () => {
      const { reservations } = await createReservationBatch(db, {
        orgId: orgId1,
        clientId: 'reserving-client',
        count: 1,
        idempotencyKey: 'key-use'
      })
      const { deliveryId } = reservations[0]

      await markReservationUsed(db, deliveryId, 'using-client')

      const updated = await getReservation(db, deliveryId)
      expect(updated).toMatchObject({
        status: RESERVATION_STATUS.USED,
        usedByClientId: 'using-client',
        usedAfterExpiry: false
      })
      expect(updated.usedAt).toBeDefined()
    })
  })

  describe('isReservationExpired / effectiveReservationState', () => {
    it('treats a reservation past its TTL as expired without a status flip', () => {
      const reservation = {
        status: RESERVATION_STATUS.RESERVED,
        expiresAt: new Date(Date.now() - 1000).toISOString()
      }

      expect(isReservationExpired(reservation)).toBe(true)
      expect(effectiveReservationState(reservation)).toBe(
        RESERVATION_STATUS.EXPIRED
      )
      expect(reservation.status).toBe(RESERVATION_STATUS.RESERVED)
    })

    it('treats a reservation within its TTL as reserved', () => {
      const reservation = {
        status: RESERVATION_STATUS.RESERVED,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString()
      }

      expect(isReservationExpired(reservation)).toBe(false)
      expect(effectiveReservationState(reservation)).toBe(
        RESERVATION_STATUS.RESERVED
      )
    })

    it('never reports a used or void reservation as expired', () => {
      const usedReservation = {
        status: RESERVATION_STATUS.USED,
        expiresAt: new Date(Date.now() - 1000).toISOString()
      }

      expect(isReservationExpired(usedReservation)).toBe(false)
      expect(effectiveReservationState(usedReservation)).toBe(
        RESERVATION_STATUS.USED
      )
    })
  })
})
