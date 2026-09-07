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

export const createMovementRecord = async (db, movement) => {
  try {
    const now = new Date().toISOString()
    const extendedMovement = {
      ...movement,
      createdAt: now
    }

    const movementsCollection = db.collection(movementsCollectionId)
    await movementsCollection.insertOne(structuredClone(extendedMovement))

    return { id: extendedMovement.id }
  } catch (error) {
    logger.error({ error }, 'Failed to create movement')
    throw error
  }
}
