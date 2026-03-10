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
import { getOrganisationValidationError } from '../common/helpers/validate-organisation.js'

async function findWithHistoryFallback(
  wasteInputsCollection,
  wasteInputsHistoryCollection,
  filters
) {
  return wasteInputsCollection
    .find(filters)
    .toArray()
    .then((result) =>
      result.length > 0
        ? result
        : wasteInputsHistoryCollection.find(filters).toArray()
    )
}

function noMovementsUpdatedResponse(h, payload) {
  return h
    .response({
      status: BULK_RESPONSE_STATUS.NO_MOVEMENTS_UPDATED,
      movements: payload.map(() => ({}))
    })
    .code(HTTP_STATUS_CODES.OK)
}

function getIdempotencyResponse(h, existingWasteInputs, payload) {
  if (existingWasteInputs.length === 0) {
    return null
  }

  return noMovementsUpdatedResponse(h, payload)
}

function getNotFoundResponse(h, wasteInputsToUpdate) {
  if (!wasteInputsToUpdate.some((wi) => !wi)) {
    return null
  }

  return h
    .response(
      wasteInputsToUpdate.map((wi, index) => {
        if (wi) {
          return {}
        }
        return {
          validation: {
            errors: [
              {
                key: `${index}.wasteTrackingId`,
                errorType: 'BusinessRuleViolation',
                message: `[${index}].wasteTrackingId waste tracking id not found`
              }
            ]
          }
        }
      })
    )
    .code(HTTP_STATUS_CODES.BAD_REQUEST)
}

function getOrgValidationResponse(h, payload, wasteInputsToUpdate) {
  const orgValidationErrors = payload.map((item, index) =>
    getOrganisationValidationError(item, wasteInputsToUpdate[index])
  )

  if (!orgValidationErrors.some(Boolean)) {
    return null
  }

  return h
    .response(
      orgValidationErrors.map((err, index) => {
        if (!err) {
          return {}
        }
        return {
          validation: {
            errors: [
              {
                key: `${index}.${err.key}`,
                errorType: err.errorType,
                message: `[${index}].${err.key} ${err.message}`
              }
            ]
          }
        }
      })
    )
    .code(HTTP_STATUS_CODES.BAD_REQUEST)
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
      const existingWasteInputs = await findWithHistoryFallback(
        wasteInputsCollection,
        wasteInputsHistoryCollection,
        filters
      )

      const idempotencyResponse = getIdempotencyResponse(
        h,
        existingWasteInputs,
        payload
      )
      if (idempotencyResponse) {
        return idempotencyResponse
      }

      const wasteInputsToUpdate = await Promise.all(
        payload.map((item) =>
          wasteInputsCollection.findOne({ _id: item.wasteTrackingId })
        )
      )

      const notFoundResponse = getNotFoundResponse(h, wasteInputsToUpdate)
      if (notFoundResponse) {
        return notFoundResponse
      }

      const orgValidationResponse = getOrgValidationResponse(
        h,
        payload,
        wasteInputsToUpdate
      )
      if (orgValidationResponse) {
        return orgValidationResponse
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
        return noMovementsUpdatedResponse(h, payload)
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
