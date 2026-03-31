import { createWasteInput } from '../services/movement-create.js'
import { movementSchema } from '../schemas/movement.js'
import { WasteInput } from '../domain/wasteInput.js'
import Joi from 'joi'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { backOff } from 'exponential-backoff'
import { BACKOFF_OPTIONS } from '../common/constants/exponential-backoff.js'
import { metricsCounter } from '../common/helpers/metrics.js'
import { handleRouteError } from '../common/helpers/bulk-route-helpers.js'

const createReceiptMovement = [
  {
    method: 'POST',
    path: '/movements/{wasteTrackingId}/receive',
    options: {
      tags: ['movements'],
      description: 'Create a new waste input with a receipt movement',
      validate: {
        payload: movementSchema,
        params: Joi.object({
          wasteTrackingId: Joi.string().required()
        })
      },
      plugins: {
        'hapi-swagger': {
          params: {},
          responses: {
            [HTTP_STATUS_CODES.NO_CONTENT]: {
              description: 'Successfully created waste input'
            },
            [HTTP_STATUS_CODES.BAD_REQUEST]: {
              description: 'Bad Request',
              schema: Joi.object({
                statusCode: Joi.number().valid(HTTP_STATUS_CODES.BAD_REQUEST),
                error: Joi.string(),
                message: Joi.string()
              }).label('BadRequestResponse')
            }
          }
        }
      }
    },
    handler: async (request, h) => {
      try {
        const { wasteTrackingId } = request.params
        const { submittingOrganisation, ...movementWithoutOrg } =
          request.payload.movement
        const wasteInput = new WasteInput()

        wasteInput.wasteTrackingId = wasteTrackingId
        wasteInput.receipt = { movement: movementWithoutOrg }
        wasteInput.traceId = request.getTraceId()
        wasteInput.submittingOrganisation = {
          defraCustomerOrganisationId:
            submittingOrganisation.defraCustomerOrganisationId
        }

        const requestOrgId = submittingOrganisation.defraCustomerOrganisationId

        await backOff(
          () => createWasteInput(request.db, wasteInput, request.getTraceId()),
          BACKOFF_OPTIONS
        )

        metricsCounter('receiver.orgId', 1, { orgId: requestOrgId })

        return h.response().code(HTTP_STATUS_CODES.NO_CONTENT)
      } catch (error) {
        return handleRouteError(h, error)
      }
    }
  }
]

export { createReceiptMovement }
