import { createLogger } from '../common/helpers/logging/logger.js'
import { AUDIT_LOGGER_TYPE } from '../common/constants/audit-logger.js'
import { auditLogger } from '../common/helpers/logging/audit-logger.js'

const logger = createLogger()

export async function createWasteInput(db, wasteInput, traceId) {
  try {
    wasteInput._id = wasteInput.wasteTrackingId
    wasteInput.revision = 1
    const now = new Date()
    wasteInput.createdAt = now
    wasteInput.lastUpdatedAt = now
    const collection = db.collection('waste-inputs')
    const result = await collection.insertOne(wasteInput)
    const wasteTrackingId = result?.insertedId

    const createdWasteInput = await collection.findOne({
      _id: wasteTrackingId,
      revision: 1
    })

    auditLogger({
      type: AUDIT_LOGGER_TYPE.MOVEMENT_CREATED,
      traceId,
      data: createdWasteInput,
      fieldsToExcludeFromLoggedData: ['receipt']
    })

    return { _id: wasteTrackingId }
  } catch (error) {
    logger.error(`Failed to create waste input: ${error.message}`)
    throw error
  }
}
