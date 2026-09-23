import { randomUUID } from 'node:crypto'
import { createDeliveryId } from './delivery.js'
import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger()
const reservationsCollectionId = 'id-reservations'

export const RESERVATION_STATUS = {
  RESERVED: 'reserved',
  USED: 'used',
  EXPIRED: 'expired',
  VOID: 'void'
}

// Prototype-only default cap and TTL. The design's self-scaling cap formula
// (see option-a-pre-reserved-delivery-IDs.md, "On the cap formula") needs
// real per-org volume data the service doesn't have yet.
export const DEFAULT_OUTSTANDING_CAP = 50
const RESERVATION_TTL_DAYS = 90

/**
 * Looks up a reservation by Delivery ID.
 *
 * @param {import('mongodb').Db} db
 * @param {string} deliveryId
 * @returns {Promise<object|null>}
 */
export const getReservation = async (db, deliveryId) =>
  db.collection(reservationsCollectionId).findOne({ deliveryId })

/**
 * A reservation is treated as expired once its TTL has passed, even though
 * no scheduled job flips its `status` in this prototype. Expiry never
 * rejects a use - see the design's "expired reclaims quota, it does not
 * reject a later use" rule - so this is read lazily wherever state matters.
 *
 * @param {object} reservation
 * @returns {boolean}
 */
export const isReservationExpired = (reservation) =>
  reservation.status === RESERVATION_STATUS.RESERVED &&
  new Date(reservation.expiresAt) < new Date()

/**
 * The reservation state as the validity lookup and the submit route should
 * report it, folding in the lazily-computed expiry above.
 *
 * @param {object} reservation
 * @returns {string}
 */
export const effectiveReservationState = (reservation) =>
  isReservationExpired(reservation)
    ? RESERVATION_STATUS.EXPIRED
    : reservation.status

/**
 * Counts an org's outstanding (reserved, not yet used/expired/void) IDs.
 *
 * @param {import('mongodb').Db} db
 * @param {string} orgId
 * @returns {Promise<number>}
 */
export const countOutstandingReservations = async (db, orgId) =>
  db.collection(reservationsCollectionId).countDocuments({
    orgId,
    status: RESERVATION_STATUS.RESERVED
  })

/**
 * Reserves a batch of Delivery IDs for an org, or - if the Idempotency-Key
 * was already used - returns the original batch instead of minting again.
 *
 * @param {import('mongodb').Db} db
 * @param {{ orgId: string, clientId: string|undefined, count: number, idempotencyKey: string }} params
 * @returns {Promise<{ reservations: object[], replay: boolean, replayConflict?: boolean, quotaExceeded?: boolean, outstanding: number, cap: number }>}
 */
export const createReservationBatch = async (
  db,
  { orgId, clientId, count, idempotencyKey }
) => {
  const collection = db.collection(reservationsCollectionId)
  const existing = await collection.find({ orgId, idempotencyKey }).toArray()

  if (existing.length > 0) {
    return {
      reservations: existing,
      replay: true,
      replayConflict: existing.length !== count,
      outstanding: await countOutstandingReservations(db, orgId),
      cap: DEFAULT_OUTSTANDING_CAP
    }
  }

  const outstanding = await countOutstandingReservations(db, orgId)

  if (outstanding + count > DEFAULT_OUTSTANDING_CAP) {
    return {
      reservations: [],
      replay: false,
      quotaExceeded: true,
      outstanding,
      cap: DEFAULT_OUTSTANDING_CAP
    }
  }

  const batchId = randomUUID()
  const reservedAt = new Date().toISOString()
  const expiresAt = new Date(
    Date.now() + RESERVATION_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const reservations = []
  for (let i = 0; i < count; i++) {
    // Minted one at a time via the same GET /next the online path uses, so
    // reservations draw from the identical per-year counter as live traffic
    // - see option-a-pre-reserved-delivery-IDs.md, "Why reservations keep
    // using GET /next". This is the only thing guaranteeing a reserved
    // Delivery ID can never collide with a Movement ID.
    const deliveryId = await createDeliveryId()
    reservations.push({
      deliveryId,
      orgId,
      reservedByClientId: clientId ?? null,
      usedByClientId: null,
      status: RESERVATION_STATUS.RESERVED,
      batchId,
      idempotencyKey,
      reservedAt,
      expiresAt,
      usedAt: null,
      usedAfterExpiry: false
    })
  }

  try {
    await collection.insertMany(reservations)
  } catch (error) {
    logger.error({ error }, 'Failed to create reservation batch')
    throw error
  }

  return {
    reservations,
    replay: false,
    outstanding: outstanding + count,
    cap: DEFAULT_OUTSTANDING_CAP
  }
}

/**
 * Flips a reservation to `used`, recording who used it. Ownership must
 * already have been checked by the caller.
 *
 * @param {import('mongodb').Db} db
 * @param {string} deliveryId
 * @param {string|undefined} clientId
 * @returns {Promise<void>}
 */
export const markReservationUsed = async (db, deliveryId, clientId) => {
  const reservation = await getReservation(db, deliveryId)

  await db.collection(reservationsCollectionId).updateOne(
    { deliveryId },
    {
      $set: {
        status: RESERVATION_STATUS.USED,
        usedByClientId: clientId ?? null,
        usedAt: new Date().toISOString(),
        usedAfterExpiry: reservation ? isReservationExpired(reservation) : false
      }
    }
  )
}
