import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger()
const movementsCollectionId = 'movements'

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

export const getMovementRecord = async (db, movementId) => {
  const movementsCollection = db.collection(movementsCollectionId)
  const movementRecord = await movementsCollection.findOne({ id: movementId })

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
