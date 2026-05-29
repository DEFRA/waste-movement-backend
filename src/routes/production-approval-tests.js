import { HTTP_STATUS } from 'waste-movement-utils'
import { handleRouteError } from '../common/helpers/bulk-route-helpers.js'
import { ValidationError } from '../common/helpers/errors/validation-error.js'
import { productionApprovalTestsSchema } from '../schemas/production-approval-tests.js'
import { runProductionApprovalTests } from '../services/production-approval-tests/run-production-approval-tests.js'

const productionApprovalTests = {
  method: 'POST',
  path: '/production-approval-tests',
  options: {
    tags: ['production-approval-tests'],
    description: 'Run one or more production approval tests',
    validate: {
      payload: productionApprovalTestsSchema
    }
  },
  handler: async (request, h) => {
    try {
      const { db, payload } = request
      const payloadWasteTrackingIds = payload.map(
        ({ wasteTrackingId }) => wasteTrackingId
      )

      const wasteInputs = await db
        .collection('waste-inputs')
        .find({ wasteTrackingId: { $in: payloadWasteTrackingIds } })
        .toArray()
        .then((results) =>
          results.reduce(
            (wiMap, wi) => wiMap.set(wi.wasteTrackingId, wi),
            new Map()
          )
        )

      const nonExistentWasteTrackingIds = findNonExistentWasteTrackingIds(
        payloadWasteTrackingIds,
        wasteInputs
      )

      if (nonExistentWasteTrackingIds.length > 0) {
        throw new ValidationError(
          'wasteTrackingId',
          `Could not find waste input(s) for the following id(s): ${nonExistentWasteTrackingIds.join(', ')}`,
          'InvalidValue'
        )
      }

      const productionApprovalTestData = payload.map((payloadItem) => ({
        ...payloadItem,
        wasteInput: wasteInputs.get(payloadItem.wasteTrackingId)
      }))

      const response = runProductionApprovalTests(productionApprovalTestData)

      return h.response(response).code(HTTP_STATUS.OK)
    } catch (error) {
      return handleRouteError(h, error)
    }
  }
}

/**
 * Returns the waste tracking ids from the payload which don't exist in Mongo
 *
 * @param {[String]} payloadWasteTrackingIds - The waste tracking ids from the payload
 * @param {Map<String, Object>} wasteInputs - The waste inputs retrieved from Mongo
 *
 * @returns {[String]} The waste tracking ids that don't exist in Mongo
 */
function findNonExistentWasteTrackingIds(payloadWasteTrackingIds, wasteInputs) {
  const uniquePayloadWasteTrackingIds = new Set(payloadWasteTrackingIds)
  const uniqueMongoWasteTrackingIds = new Set(wasteInputs.keys())
  return [
    ...uniquePayloadWasteTrackingIds.difference(uniqueMongoWasteTrackingIds)
  ]
}

export { productionApprovalTests }
