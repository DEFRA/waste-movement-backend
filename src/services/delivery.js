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
 * Finds the Movement IDs delivered under the given delivery id. Reads every
 * record with that id, as a resubmitted hazardous Movement has more than one
 * (see createDeliveryRecords).
 *
 * @param {import('mongodb').Db} db
 * @param {string} deliveryId
 * @returns {Promise<string[] | null>} deduplicated (empty for an undocumented
 * receipt's delivery); null when no delivery exists
 */
export const findDeliveryMovementIds = async (db, deliveryId) => {
  const deliveries = await db
    .collection(deliveriesCollectionId)
    .find({ deliveryId }, { projection: { movementIds: 1 } })
    .toArray()

  if (deliveries.length === 0) {
    return null
  }

  return [
    ...new Set(deliveries.flatMap(({ movementIds }) => movementIds ?? []))
  ]
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

/**
 * Persists several new delivery records, in order, sharing one `createdAt`.
 * Written in one transaction, so a failure leaves none of them behind and the
 * caller can safely retry.
 *
 * NOTE: the `deliveries` collection has no indexes, so nothing stops the same
 * data being stored twice: a Movement submitted in a second delivery gets a
 * second record, and a resubmitted hazardous Movement produces two records
 * with the same `deliveryId` (its Movement ID). To be addressed, e.g. with a
 * unique index on `deliveryId`, once the database layer is defined.
 *
 * @param {import('mongodb').Db} db
 * @param {import('mongodb').MongoClient} mongoClient
 * @param {{ deliveryId: string, movementIds: string[], wasteType: string, orgId: string }[]} deliveries
 * @returns {Promise<{ deliveryId: string, movementIds: string[], wasteType: string }[]>}
 */
export const createDeliveryRecords = async (db, mongoClient, deliveries) => {
  const session = mongoClient.startSession()
  try {
    const createdAt = new Date().toISOString()
    const extendedDeliveries = deliveries.map((delivery) => ({
      ...delivery,
      createdAt
    }))

    await session.withTransaction(() =>
      db
        .collection(deliveriesCollectionId)
        .insertMany(structuredClone(extendedDeliveries), {
          ordered: true,
          session
        })
    )

    return extendedDeliveries.map(({ deliveryId, movementIds, wasteType }) => ({
      deliveryId,
      movementIds,
      wasteType
    }))
  } catch (error) {
    logger.error({ error }, 'Failed to create deliveries')
    throw error
  } finally {
    await session.endSession()
  }
}
