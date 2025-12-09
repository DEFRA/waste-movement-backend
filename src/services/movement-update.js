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
  traceId,
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
    const revision = existingWasteInput.revision
    let result

    await session.withTransaction(async () => {
      await wasteInputsHistoryCollection.insertOne(historyEntry, { session })

      result = await wasteInputsCollection.updateOne(
        { _id: wasteTrackingId, orgId: requestOrgId, revision },
        {
          $set: {
            ...(fieldToUpdate
              ? { [fieldToUpdate]: { ...updateData } }
              : updateData),
            lastUpdatedAt: new Date(),
            traceId
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

    await createAuditLog(
      [wasteInputsCollection, wasteInputsHistoryCollection],
      wasteTrackingId,
      revision,
      traceId
    )

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

/**
 * Fetches the updated record from either of the provided collections and sends to the CDP audit endpoint
 * @param {Array} collections - The MongoDB collections from which the audit data is fetched
 * @param {Number} wasteTrackingId - The request waste tracking id
 * @param {Number} existingRevision - The revision of the updated record
 * @param {String} traceId - The unique id of the request
 * @param {Object} session - The MongoDB session for the transaction
 */
async function createAuditLog(
  collections,
  wasteTrackingId,
  existingRevision,
  traceId,
  session
) {
  let updatedWasteInput

  for (const collection of collections) {
    if (!updatedWasteInput) {
      updatedWasteInput = await collection.findOne(
        { _id: wasteTrackingId, revision: existingRevision + 1 },
        { session }
      )
    }
  }

  auditLogger({
    type: AUDIT_LOGGER_TYPE.MOVEMENT_UPDATED,
    traceId,
    data: updatedWasteInput
  })
}
