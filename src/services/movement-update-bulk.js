import { createLogger } from '../common/helpers/logging/logger.js'
import { createHistoryEntry } from '../common/helpers/create-history-entry.js'
import { auditLogger } from '../common/helpers/logging/audit-logger.js'
import { AUDIT_LOGGER_TYPE } from 'waste-movement-utils'
import { findWasteInputs } from '../common/helpers/find-waste-inputs.js'

const logger = createLogger()

async function sendAuditLogs(
  wasteInputsCollection,
  payload,
  existingWasteInputs,
  traceId
) {
  const updatedWasteInputs = await findWasteInputs(
    payload.length,
    [wasteInputsCollection],
    payload.map((item, index) => ({
      wasteTrackingId: item.wasteTrackingId,
      revision: existingWasteInputs[index].revision + 1
    }))
  )

  updatedWasteInputs.forEach((wasteInput) => {
    auditLogger({
      type: AUDIT_LOGGER_TYPE.MOVEMENT_UPDATED,
      traceId,
      data: wasteInput,
      wasteTrackingId: wasteInput.wasteTrackingId,
      revision: wasteInput.revision
    })
  })
}

async function performBulkUpdate(
  wasteInputsCollection,
  wasteInputsHistoryCollection,
  payload,
  bulkId,
  traceId,
  existingWasteInputs,
  session
) {
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
    return true
  }

  const dateNow = new Date()

  const historyEntries = payload.map((item, index) =>
    createHistoryEntry(existingWasteInputs[index], item.wasteTrackingId)
  )

  await wasteInputsHistoryCollection.insertMany(historyEntries, { session })

  const updateOps = payload.map((item, index) => {
    const existing = existingWasteInputs[index]
    delete item.submittingOrganisation

    return {
      updateOne: {
        filter: { _id: item.wasteTrackingId, revision: existing.revision },
        update: {
          $set: {
            receipt: { movement: item },
            bulkId,
            lastUpdatedAt: dateNow,
            traceId
          },
          $inc: { revision: 1 }
        }
      }
    }
  })

  const bulkResult = await wasteInputsCollection.bulkWrite(updateOps, {
    session
  })

  if (bulkResult.matchedCount !== payload.length) {
    const failedItem = payload[bulkResult.matchedCount]
    throw new Error(
      `Failed to update waste inputs: Concurrent update detected for waste tracking id (${failedItem.wasteTrackingId})`
    )
  }

  return false
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
      alreadyUpdated = await performBulkUpdate(
        wasteInputsCollection,
        wasteInputsHistoryCollection,
        payload,
        bulkId,
        traceId,
        existingWasteInputs,
        session
      )
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
    logger.error({ error }, 'Failed to update waste inputs')
    throw error
  } finally {
    await session.endSession()
  }
}
