import { ValidationError } from '../common/helpers/errors/validation-error.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { getOrgIdForApiCode } from '../common/helpers/validate-api-code.js'
import { config } from '../config.js'
import { AUDIT_LOGGER_TYPE } from '../common/constants/audit-logger.js'
import { auditLogger } from '../common/helpers/logging/audit-logger.js'

const logger = createLogger()

export async function updateWasteInput(
  db,
  wasteTrackingId,
  updateData,
  mongoClient,
  requestTraceId,
  fieldToUpdate = undefined
) {
  const session = mongoClient.startSession()

  try {
    const wasteInputsCollection = db.collection('waste-inputs')
    const wasteInputsHistoryCollection = db.collection('waste-inputs-history')
    const invalidSubmissionsCollection = db.collection('invalid-submissions')

    const existingWasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId
    })

    if (!existingWasteInput) {
      await invalidSubmissionsCollection.insertOne({
        wasteTrackingId,
        updateData,
        timestamp: new Date(),
        reason: 'Waste input not found'
      })
      return { matchedCount: 0, modifiedCount: 0 }
    }

    const historyEntry = {
      ...existingWasteInput,
      wasteTrackingId, // Add reference to original document
      timestamp: new Date()
    }
    delete historyEntry._id

    const orgApiCodes = config.get('orgApiCodes')
    const requestOrgId = getOrgIdForApiCode(updateData.apiCode, orgApiCodes)
    const now = new Date()
    let result

    await session.withTransaction(async () => {
      await wasteInputsHistoryCollection.insertOne(historyEntry, { session })

      result = await wasteInputsCollection.updateOne(
        { _id: wasteTrackingId, orgId: requestOrgId },
        {
          $set: {
            ...(fieldToUpdate
              ? { [fieldToUpdate]: { ...updateData } }
              : updateData),
            lastUpdatedAt: now
          },
          $inc: { revision: 1 }
        },
        { session }
      )
    })

    if (result.matchedCount === 0) {
      // Returning the error because if it's thrown then it'll invoke the exponential
      // backoff which isn't what we want in this scenario because we don't need to
      // retry and we want the error to be directly returned to the user
      return new ValidationError(
        'apiCode',
        'the API Code supplied does not relate to the same Organisation as created the original waste item record'
      )
    }

    const updatedWasteInput = await wasteInputsCollection.findOne({
      _id: wasteTrackingId,
      revision: existingWasteInput.revision + 1
    })

    auditLogger({
      type: AUDIT_LOGGER_TYPE.MOVEMENT_CREATED,
      correlationId: requestTraceId,
      data: updatedWasteInput,
      excludeFromLogData: ['receipt']
    })

    return {
      matchedCount: result?.matchedCount,
      modifiedCount: result?.modifiedCount
    }
  } catch (error) {
    logger.error(`Failed to update waste input: ${error.message}`)
    throw error
  } finally {
    await session.endSession()
  }
}
