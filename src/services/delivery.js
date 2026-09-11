import { httpClients } from '../common/helpers/http-client.js'
import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger()
const deliveriesCollectionId = 'deliveries'

/**
 * Mints a new unique delivery id.
 *
 * @returns {Promise<string>}
 */
export const createDeliveryId = async () => {
  const wasteTrackingResponse = await httpClients.wasteTracking.get('/next')
  return wasteTrackingResponse.payload.wasteTrackingId
}

/**
 * Checks whether a delivery with the given id exists.
 *
 * @param {import('mongodb').Db} db
 * @param {string} deliveryId
 * @returns {Promise<boolean>}
 */
export const deliveryExists = async (db, deliveryId) => {
  const delivery = await db
    .collection(deliveriesCollectionId)
    .findOne({ deliveryId }, { projection: { deliveryId: 1 } })

  return Boolean(delivery)
}

/**
 * Persists a new delivery record.
 *
 * @param {import('mongodb').Db} db
 * @param {{ deliveryId: string, movementIds: string[], wasteType: string, orgId: string }} delivery
 * @returns {Promise<{ deliveryId: string, movementIds: string[], wasteType: string }>}
 */
export const createDeliveryRecord = async (db, delivery) => {
  try {
    const extendedDelivery = {
      ...delivery,
      createdAt: new Date().toISOString()
    }

    await db
      .collection(deliveriesCollectionId)
      .insertOne(structuredClone(extendedDelivery))

    return {
      deliveryId: extendedDelivery.deliveryId,
      movementIds: extendedDelivery.movementIds,
      wasteType: extendedDelivery.wasteType
    }
  } catch (error) {
    logger.error({ error }, 'Failed to create delivery')
    throw error
  }
}
