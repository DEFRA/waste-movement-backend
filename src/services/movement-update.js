import { ValidationError } from '../common/helpers/errors/validation-error.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { getOrgIdForApiCode } from '../common/helpers/validate-api-code.js'
import { config } from '../config.js'
import { AUDIT_LOGGER_TYPE } from '../common/constants/audit-logger.js'
import { auditLogger } from '../common/helpers/logging/audit-logger.js'

const logger = createLogger()

function createHistoryEntry(existingWasteInput, wasteTrackingId) {
  const historyEntry = {
    ...existingWasteInput,
    wasteTrackingId,
    timestamp: new Date()
  }
  delete historyEntry._id
  return historyEntry
}

function createOrgMismatchError() {
  return new ValidationError(
    'apiCode',
    'the API Code supplied does not relate to the same Organisation as created the original waste item record',
    'BusinessRuleViolation'
  )
}

export async function updateWasteInput(
  db,
  wasteTrackingId,
  updateData,
  mongoClient,
  traceId,
  fieldToUpdate = undefined,
  submittingOrganisation = null
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

    const historyEntry = createHistoryEntry(existingWasteInput, wasteTrackingId)
    const requestOrgId = getOrgIdForApiCode(
      updateData.apiCode,
      config.get('orgApiCodes')
    )
    const revision = existingWasteInput.revision
    let result

    await session.withTransaction(async () => {
      await wasteInputsHistoryCollection.insertOne(historyEntry, { session })

      const updateSet = {
        ...(fieldToUpdate
          ? { [fieldToUpdate]: { ...updateData } }
          : updateData),
        lastUpdatedAt: new Date(),
        traceId
      }

      if (submittingOrganisation?.defraCustomerOrganisationId) {
        updateSet.submittingOrganisation = {
          defraCustomerOrganisationId:
            submittingOrganisation.defraCustomerOrganisationId
        }
        // Strip apiCode from stored data when using new org structure
        const { apiCode, ...dataWithoutApiCode } = updateData
        if (fieldToUpdate) {
          updateSet[fieldToUpdate] = { ...dataWithoutApiCode }
        }
      }

      result = await wasteInputsCollection.updateOne(
        { _id: wasteTrackingId, orgId: requestOrgId, revision },
        {
          $set: updateSet,
          $inc: { revision: 1 }
        },
        { session }
      )
    })

    if (result.matchedCount === 0) {
      return createOrgMismatchError()
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
