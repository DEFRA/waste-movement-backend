import Joi from 'joi'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { backOff } from 'exponential-backoff'
import { BACKOFF_OPTIONS } from '../common/constants/exponential-backoff.js'
import { updateBulkWasteInput } from '../services/movement-update-bulk.js'
import { BULK_RESPONSE_STATUS } from '../common/constants/bulk-response-status.js'
import {
  badRequestResponse,
  handleRouteError
} from '../common/helpers/bulk-route-helpers.js'
import { bulkUpdateMovementRequestSchema } from '../schemas/bulk-receipt.js'
import { getOrgIdForApiCode } from '../common/helpers/validate-api-code.js'
import { ValidationError } from '../common/helpers/errors/validation-error.js'
import { config } from '../config.js'

function validateOrganisation(item, existing) {
  if (item.apiCode) {
    const requestOrgId = getOrgIdForApiCode(
      item.apiCode,
      config.get('orgApiCodes')
    )
    if (existing.orgId !== requestOrgId) {
      throw new ValidationError(
        'apiCode',
        'the API Code supplied does not relate to the same Organisation as created the original waste item record',
        'BusinessRuleViolation'
      )
    }
  } else if (
    item.submittingOrganisation.defraCustomerOrganisationId !==
    existing.submittingOrganisation?.defraCustomerOrganisationId
  ) {
    throw new ValidationError(
      'submittingOrganisation',
      'the submitting organisation does not match the Organisation that created the original waste item record',
      'BusinessRuleViolation'
    )
  }
}

const updateBulkReceiptMovement = {
  method: 'PUT',
  path: '/bulk/{bulkId}/movements/receive',
  options: {
    tags: ['movements', 'bulk-upload'],
    description: 'Update multiple existing waste inputs with receipt movements',
    validate: {
      payload: bulkUpdateMovementRequestSchema,
      params: Joi.object({
        bulkId: Joi.string().required()
      })
    },
    plugins: {
      'hapi-swagger': {
        params: {},
        responses: {
          [HTTP_STATUS_CODES.OK]: {
            description: 'Successfully updated waste inputs'
          },
          ...badRequestResponse
        }
      }
    }
  },
  handler: async (request, h) => {
    try {
      const {
        params: { bulkId },
        payload
      } = request
      const wasteInputsCollection = request.db.collection('waste-inputs')
      const wasteInputsHistoryCollection = request.db.collection(
        'waste-inputs-history'
      )

      const filters = { bulkId, revision: { $gt: 1 } }
      const existingWasteInputs = await wasteInputsCollection
        .find(filters)
        .toArray()
        .then((result) =>
          result.length > 0
            ? result
            : wasteInputsHistoryCollection.find(filters).toArray()
        )

      if (existingWasteInputs.length > 0) {
        return h
          .response({
            status: BULK_RESPONSE_STATUS.NO_MOVEMENTS_UPDATED,
            movements: payload.map(() => ({}))
          })
          .code(HTTP_STATUS_CODES.OK)
      }

      const wasteInputsToUpdate = await Promise.all(
        payload.map((item) =>
          wasteInputsCollection.findOne({ _id: item.wasteTrackingId })
        )
      )

      if (
        wasteInputsToUpdate.length !== payload.length ||
        wasteInputsToUpdate.some((wi) => !wi)
      ) {
        throw new Error(
          `Failed to update waste inputs: One or more waste tracking ids not found for bulkId (${bulkId})`
        )
      }

      for (const [index, item] of payload.entries()) {
        validateOrganisation(item, wasteInputsToUpdate[index])
      }

      const movements = await backOff(
        () =>
          updateBulkWasteInput(
            request.db,
            request.mongoClient,
            payload,
            bulkId,
            request.getTraceId(),
            wasteInputsToUpdate
          ),
        BACKOFF_OPTIONS
      )

      if (!movements) {
        return h
          .response({
            status: BULK_RESPONSE_STATUS.NO_MOVEMENTS_UPDATED,
            movements: payload.map(() => ({}))
          })
          .code(HTTP_STATUS_CODES.OK)
      }

      return h
        .response({
          status: BULK_RESPONSE_STATUS.MOVEMENTS_UPDATED,
          movements
        })
        .code(HTTP_STATUS_CODES.OK)
    } catch (error) {
      return handleRouteError(h, error)
    }
  }
}

export { updateBulkReceiptMovement }
