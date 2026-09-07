import { httpClients } from '../common/helpers/http-client.js'
import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger()
const movementsCollectionId = 'movements'

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
