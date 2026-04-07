import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger()

/**
 * Gets the waste inputs for a given wasteTrackingId or bulkId
 *
 * Optionally can include the history items
 *
 * @param {Object} params
 * @param {Db} params.db - MongoDB client
 * @param {String} params.wasteTrackingId - The waste tracking id
 * @param {String} params.bulkId - The bulk id
 * @param {Boolean} params.includeHistory - Determines if the history waste inputs are returned
 *
 * @returns {Promise<Array>} Array of waste inputs
 */
async function getWasteInputs({ db, wasteTrackingId, bulkId, includeHistory }) {
  try {
    const wasteInputsCollection = db.collection('waste-inputs')
    const wasteInputs = await findWasteInputs(
      wasteInputsCollection,
      wasteTrackingId,
      bulkId
    )

    if (includeHistory) {
      const wasteInputsHistoryCollection = db.collection('waste-inputs-history')
      const wasteInputsHistory = await findWasteInputs(
        wasteInputsHistoryCollection,
        wasteTrackingId,
        bulkId
      )

      wasteInputs.push(...wasteInputsHistory)
    }

    return wasteInputs
  } catch (error) {
    logger.error({ error }, 'Failed to get waste inputs')
    throw error
  }
}

/**
 * Finds the waste inputs for a given wasteTrackingId or bulkId
 *
 * @param {Collection} collection - MongoDB collection
 * @param {String} wasteTrackingId - The waste tracking id
 * @param {String} bulkId - The bulk id
 *
 * @returns {Promise<Array>} Array of waste inputs
 */
function findWasteInputs(collection, wasteTrackingId, bulkId) {
  return collection
    .find({
      ...(wasteTrackingId ? { wasteTrackingId } : {}),
      ...(bulkId ? { bulkId } : {})
    })
    .sort({ revision: 'desc' })
    .toArray()
}

export { getWasteInputs }
