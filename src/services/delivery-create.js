import { httpClients } from '../common/helpers/http-client.js'
import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger()
const movementsCollectionId = 'movements'
const deliveriesCollectionId = 'deliveries'

/**
 * Mints a new unique delivery id.
 *
 * @returns {Promise<string>}
 */
export async function createDeliveryId() {
  const wasteTrackingResponse = await httpClients.wasteTracking.get('/next')
  return wasteTrackingResponse.payload.wasteTrackingId
}

/**
 * Looks up the given movement IDs in the `movements` collection and returns
 * the subset that exist.
 *
 * @param {import('mongodb').Db} db
 * @param {string[]} movementIds
 * @returns {Promise<string[]>} the movement IDs that were found
 */
export async function findMovementIds(db, movementIds) {
  const movementsCollection = db.collection(movementsCollectionId)
  const found = await movementsCollection
    .find(
      { movementId: { $in: movementIds } },
      { projection: { movementId: 1 } }
    )
    .toArray()

  return found.map((movement) => movement.movementId)
}

/**
 * Persists a new delivery record.
 *
 * @param {import('mongodb').Db} db
 * @param {{ deliveryId: string, movementIds: string[], orgId: string }} delivery
 * @returns {Promise<{ deliveryId: string }>}
 */
export async function createDeliveryRecord(db, delivery) {
  try {
    const extendedDelivery = {
      ...delivery,
      createdAt: new Date().toISOString()
    }

    await db
      .collection(deliveriesCollectionId)
      .insertOne(structuredClone(extendedDelivery))

    return { deliveryId: extendedDelivery.deliveryId }
  } catch (error) {
    logger.error({ error }, 'Failed to create delivery')
    throw error
  }
}
