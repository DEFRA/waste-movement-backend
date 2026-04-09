import { config } from '../../config.js'

/**
 * Finds waste inputs for the given wasteTrackingIdsAndRevisions in the given collections.
 *
 * This is done in a loop to ensure that all data has been persisted to the cluster before
 * we try to fetch the data, otherwise the data could be fetched from a replica that
 * hasn't been updated yet resulting in a data mismatch error being thrown.
 *
 * Most of the time the data should be fetched on the first try.
 *
 * The number of fetch attempts is set with an env var and has a default set in the
 * config.
 *
 * @param {Number} requestWasteInputsCount - The number of waste inputs in the request
 * @param {[Collection]} collections - The collections in which to find the waste inputs
 * @param {[{ wasteTrackingId: Number, revision: Number }]} wasteTrackingIdsAndRevisions - The waste tracking ids and revisions that were previously saved
 *
 * @returns {Promise<Array>} The waste inputs
 */
export async function findWasteInputs(
  requestWasteInputsCount,
  collections,
  wasteTrackingIdsAndRevisions
) {
  let mongoFetchAttempts = config.get('mongoFetchAttempts')
  let wasteInputs = []

  while (
    mongoFetchAttempts > 0 &&
    wasteInputs.length !== requestWasteInputsCount
  ) {
    mongoFetchAttempts--

    for (const collection of collections) {
      if (wasteInputs.length === 0) {
        wasteInputs = await collection
          .find({
            $or: wasteTrackingIdsAndRevisions.map(
              ({ wasteTrackingId, revision }) => ({
                _id: wasteTrackingId,
                revision
              })
            )
          })
          .toArray()
      }
    }
  }

  if (wasteInputs.length !== requestWasteInputsCount) {
    throw new Error(
      `Failed to find waste inputs: Number of waste inputs found is different to the request waste inputs: Expected '${requestWasteInputsCount}' but found '${wasteInputs.length}'`
    )
  }

  return wasteInputs
}
