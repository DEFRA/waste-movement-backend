import { ValidationError } from '../common/helpers/errors/validation-error.js'
import { createLogger } from '../common/helpers/logging/logger.js'
import { AUDIT_LOGGER_TYPE } from '../common/constants/audit-logger.js'
import { auditLogger } from '../common/helpers/logging/audit-logger.js'
import { createHistoryEntry } from '../common/helpers/create-history-entry.js'

const logger = createLogger()

function createOrgMismatchError() {
  return new ValidationError(
    'submittingOrganisation',
    'the submitting organisation does not match the Organisation that created the original waste item record',
    'BusinessRuleViolation'
  )
}

function buildUpdateSet(
  updateData,
  fieldToUpdate,
  submittingOrganisation,
  traceId
) {
  const { submittingOrganisation: _, ...dataWithoutOrg } = updateData

  const updateSet = {
    ...(fieldToUpdate
      ? { [fieldToUpdate]: { ...dataWithoutOrg } }
      : dataWithoutOrg),
    lastUpdatedAt: new Date(),
    traceId
  }

  if (submittingOrganisation?.defraCustomerOrganisationId) {
    updateSet.submittingOrganisation = {
      defraCustomerOrganisationId:
        submittingOrganisation.defraCustomerOrganisationId
    }
  }

  return updateSet
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

    const requestOrgId =
      submittingOrganisation?.defraCustomerOrganisationId ??
      updateData.submittingOrganisation?.defraCustomerOrganisationId

    const revision = existingWasteInput.revision
    let result

    await session.withTransaction(async () => {
      await wasteInputsHistoryCollection.insertOne(historyEntry, { session })

      const updateSet = buildUpdateSet(
        updateData,
        fieldToUpdate,
        submittingOrganisation,
        traceId
      )

      result = await wasteInputsCollection.updateOne(
        {
          _id: wasteTrackingId,
          'submittingOrganisation.defraCustomerOrganisationId': requestOrgId,
          revision
        },
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
    logger.error({ error }, 'Failed to update waste input')
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
    data: updatedWasteInput,
    wasteTrackingId,
    revision: existingRevision + 1
  })
}
