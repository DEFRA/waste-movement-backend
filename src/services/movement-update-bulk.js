import { createLogger } from '../common/helpers/logging/logger.js'
import { createHistoryEntry } from '../common/helpers/create-history-entry.js'
import { auditLogger } from '../common/helpers/logging/audit-logger.js'
import { AUDIT_LOGGER_TYPE } from '../common/constants/audit-logger.js'

const logger = createLogger()

async function sendAuditLogs(
  wasteInputsCollection,
  payload,
  existingWasteInputs,
  traceId
) {
  const updatedWasteInputs = await wasteInputsCollection
    .find({
      $or: payload.map((item, index) => ({
        _id: item.wasteTrackingId,
        revision: existingWasteInputs[index].revision + 1
      }))
    })
    .toArray()

  updatedWasteInputs.forEach((wasteInput) => {
    auditLogger({
      type: AUDIT_LOGGER_TYPE.MOVEMENT_UPDATED,
      traceId,
      data: wasteInput
    })
  })
}

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

    let alreadyUpdated = false

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
        alreadyUpdated = true
        return
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

    if (alreadyUpdated) {
      return null
    }

    await sendAuditLogs(
      wasteInputsCollection,
      payload,
      existingWasteInputs,
      traceId
    )

    return payload.map(() => ({}))
  } catch (error) {
    logger.error(`Failed to update waste inputs: ${error.message}`)
    throw error
  } finally {
    await session.endSession()
  }
}
