import { createLogger } from '../common/helpers/logging/logger.js'
import { AUDIT_LOGGER_TYPE } from 'waste-movement-utils'
import { auditLogger } from '../common/helpers/logging/audit-logger.js'
import { findWasteInputs } from '../common/helpers/find-waste-inputs.js'

const logger = createLogger()

export async function createWasteInput(db, wasteInput, traceId) {
  try {
    wasteInput._id = wasteInput.wasteTrackingId
    wasteInput.revision = 1
    const now = new Date()
    wasteInput.createdAt = now
    wasteInput.lastUpdatedAt = now
    const wasteInputsCollection = db.collection('waste-inputs')
    const result = await wasteInputsCollection.insertOne(wasteInput)
    const wasteTrackingId = result?.insertedId

    const [createdWasteInput] = await findWasteInputs(
      1,
      [wasteInputsCollection],
      [{ wasteTrackingId, revision: 1 }]
    )

    auditLogger({
      type: AUDIT_LOGGER_TYPE.MOVEMENT_CREATED,
      traceId,
      data: createdWasteInput,
      wasteTrackingId: createdWasteInput.wasteTrackingId,
      revision: createdWasteInput.revision
    })

    return { _id: wasteTrackingId }
  } catch (error) {
    logger.error({ error }, 'Failed to create waste input')
    throw error
  }
}
