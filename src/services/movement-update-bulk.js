import { createLogger } from '../common/helpers/logging/logger.js'
import { createHistoryEntry } from '../common/helpers/create-history-entry.js'

const logger = createLogger()

export async function updateBulkWasteInput(
  db,
  mongoClient,
  payload,
  bulkId,
  traceId,
  existingWasteInputs
) {
  const session = mongoClient.startSession()

  try {
    const wasteInputsCollection = db.collection('waste-inputs')
    const wasteInputsHistoryCollection = db.collection('waste-inputs-history')

    await session.withTransaction(async () => {
      const filters = { bulkId, revision: { $gt: 1 } }
      const existingWasteInput = await wasteInputsCollection
        .findOne(filters, { session, readPreference: 'primary' })
        .then(
          (result) =>
            result ||
            wasteInputsHistoryCollection.findOne(filters, {
              session,
              readPreference: 'primary'
            })
        )

      if (existingWasteInput) {
        throw new Error(
          `Failed to update waste inputs: Waste inputs with bulk id (${bulkId}) have already been updated`
        )
      }

      const dateNow = new Date()

      for (const [index, item] of payload.entries()) {
        const existing = existingWasteInputs[index]

        const historyEntry = createHistoryEntry(existing, item.wasteTrackingId)
        await wasteInputsHistoryCollection.insertOne(historyEntry, { session })

        const result = await wasteInputsCollection.updateOne(
          { _id: item.wasteTrackingId, revision: existing.revision },
          {
            $set: {
              receipt: item,
              bulkId,
              lastUpdatedAt: dateNow,
              traceId
            },
            $inc: { revision: 1 }
          },
          { session }
        )

        if (result.matchedCount === 0) {
          throw new Error(
            `Failed to update waste inputs: Concurrent update detected for waste tracking id (${item.wasteTrackingId})`
          )
        }
      }
    })

    return payload.map(() => ({}))
  } catch (error) {
    logger.error(`Failed to update waste inputs: ${error.message}`)
    throw error
  } finally {
    await session.endSession()
  }
}
