import { httpClients } from '../common/helpers/http-client.js'
import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger()
const movementDataByVersion = new Map()

/**
 * Mints a new unique movement id.
 *
 * @returns {Promise<string>}
 */
export const createMovementId = async () => {
  const wasteTrackingResponse = await httpClients.wasteTracking.get('/next')
  return wasteTrackingResponse.payload.wasteTrackingId
}

/**
 * The movement data access for one API version, reading and writing that
 * version's own collection, e.g. `beta-2-movements`. Returns the same object
 * for the same version, so tests can spy on its functions.
 *
 * @param {string} apiVersion - e.g. 'beta-2'
 */
export const movementDataCreate = (apiVersion) => {
  if (!movementDataByVersion.has(apiVersion)) {
    movementDataByVersion.set(apiVersion, buildMovementData(apiVersion))
  }
  return movementDataByVersion.get(apiVersion)
}

const buildMovementData = (apiVersion) => {
  const collectionName = `${apiVersion}-movements`

  return {
    /**
     * Looks up a movement record by its movement ID.
     *
     * @param {import('mongodb').Db} db
     * @param {string} movementId
     * @returns {Promise<{ movementId: string, orgId: string, wasteItems?: object[], createdAt: string } | null>}
     */
    getMovementRecord: async (db, movementId) => {
      const movementsCollection = db.collection(collectionName)
      return movementsCollection.findOne({ movementId })
    },

    /**
     * Looks up the given movement IDs and returns the subset that exist.
     *
     * @param {import('mongodb').Db} db
     * @param {string[]} movementIds
     * @returns {Promise<string[]>} the movement IDs that were found
     */
    findMovementIds: async (db, movementIds) => {
      const movementsCollection = db.collection(collectionName)
      const found = await movementsCollection
        .find(
          { movementId: { $in: movementIds } },
          { projection: { movementId: 1 } }
        )
        .toArray()

      return found.map((movement) => movement.movementId)
    },

    /**
     * Looks up the given movement IDs and returns the subset that exist, with
     * only their waste items' classifications, which is all a delivery needs.
     * Movements created before waste items were stored have no `wasteItems`.
     *
     * @param {import('mongodb').Db} db
     * @param {string[]} movementIds
     * @returns {Promise<{ movementId: string, wasteItems?: { classification: object }[] }[]>}
     */
    findMovements: async (db, movementIds) => {
      const movementsCollection = db.collection(collectionName)
      return movementsCollection
        .find(
          { movementId: { $in: movementIds } },
          {
            projection: {
              _id: 0,
              movementId: 1,
              'wasteItems.classification': 1
            }
          }
        )
        .toArray()
    },

    /**
     * Persists a new movement record.
     *
     * NOTE: the movements collections have no indexes, so nothing stops a
     * `movementId` being stored twice, e.g. if a retry repeats a write that
     * had already succeeded. To be addressed, e.g. with a unique index on
     * `movementId`, once the database layer is defined.
     *
     * @param {import('mongodb').Db} db
     * @param {{ movementId: string, orgId: string, wasteItems?: object[] }} movement
     * @returns {Promise<{ movementId: string }>}
     */
    createMovementRecord: async (db, movement) => {
      try {
        const extendedMovement = {
          ...movement,
          createdAt: new Date().toISOString()
        }

        await db
          .collection(collectionName)
          .insertOne(structuredClone(extendedMovement))

        return { movementId: extendedMovement.movementId }
      } catch (error) {
        logger.error({ error }, 'Failed to create movement')
        throw error
      }
    }
  }
}
