import { httpClients } from '../common/helpers/http-client.js'
import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger()
const movementsCollectionId = 'movements'

export const getMovementRecord = async (db, movementId) => {
  const movementsCollection = db.collection(movementsCollectionId)
  const movementRecord = await movementsCollection.findOne({ movementId })

  return movementRecord
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
 * Mints a new unique movement id.
 *
 * @returns {Promise<string>}
 */
export async function createMovementId() {
  const wasteTrackingResponse = await httpClients.wasteTracking.get('/next')
  return wasteTrackingResponse.payload.wasteTrackingId
}

/**
 * Persists a new movement record.
 *
 * @param {import('mongodb').Db} db
 * @param {{ movementId: string, orgId: string }} movement
 * @returns {Promise<{ movementId: string }>}
 */
export const createMovementRecord = async (db, movement) => {
  try {
    const extendedMovement = {
      ...movement,
      createdAt: new Date().toISOString()
    }

    await db
      .collection(movementsCollectionId)
      .insertOne(structuredClone(extendedMovement))

    return { movementId: extendedMovement.movementId }
  } catch (error) {
    logger.error({ error }, 'Failed to create movement')
    throw error
  }
}
