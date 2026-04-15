import { AUDIT_LOGGER_TYPE } from '../common/constants/audit-logger.js'
import { BULK_RESPONSE_STATUS } from '../common/constants/bulk-response-status.js'
import { findWasteInputs } from '../common/helpers/find-waste-inputs.js'
import { auditLogger } from '../common/helpers/logging/audit-logger.js'
import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger()

function sendAuditLogs(createdWasteInputs) {
  createdWasteInputs.forEach((wasteInput) => {
    auditLogger({
      type: AUDIT_LOGGER_TYPE.MOVEMENT_CREATED,
      traceId: wasteInput.traceId,
      data: wasteInput,
      wasteTrackingId: wasteInput.wasteTrackingId,
      revision: wasteInput.revision
    })
  })
}

export async function createBulkWasteInput(db, mongoClient, wasteInputs) {
  try {
    let existingWasteInputs = []

    const createdWasteTrackingIds = []
    const wasteInputsCollection = db.collection('waste-inputs')
    const wasteInputsHistoryCollection = db.collection('waste-inputs-history')

    // Pre-validate all wasteTrackingIds and set _id fields before the transaction
    for (const wasteInput of wasteInputs) {
      if (!wasteInput.wasteTrackingId) {
        throw new Error(
          `Failed to create waste inputs: Not all waste inputs with bulk id (${wasteInput.bulkId}) have a waste tracking id`
        )
      }
      wasteInput._id = wasteInput.wasteTrackingId
    }

    // insertMany inside a transaction is atomic — rolls back all inserts on failure
    const session = mongoClient.startSession()
    await session.withTransaction(async () => {
      const filters = { bulkId: wasteInputs[0].bulkId, revision: 1 }
      const options = { session, readPreference: 'primary' }

      existingWasteInputs = await wasteInputsCollection
        .find(filters, options)
        .toArray()
        .then((result) =>
          result.length > 0
            ? result
            : wasteInputsHistoryCollection.find(filters, options).toArray()
        )

      if (existingWasteInputs.length > 0) {
        return
      }

      const insertResult = await wasteInputsCollection.insertMany(wasteInputs, {
        session
      })

      createdWasteTrackingIds.push(...Object.values(insertResult.insertedIds))
    })

    if (existingWasteInputs.length > 0) {
      return {
        status: BULK_RESPONSE_STATUS.MOVEMENTS_NOT_CREATED,
        wasteInputs: existingWasteInputs
      }
    }

    const createdWasteInputs = await findWasteInputs(
      wasteInputs.length,
      [wasteInputsCollection],
      createdWasteTrackingIds.map((wasteTrackingId) => ({
        wasteTrackingId,
        revision: 1
      }))
    )

    sendAuditLogs(createdWasteInputs)

    return {
      status: BULK_RESPONSE_STATUS.MOVEMENTS_CREATED,
      wasteInputs: createdWasteInputs
    }
  } catch (error) {
    logger.error({ error }, 'Failed to create waste inputs')
    throw error
  }
}
