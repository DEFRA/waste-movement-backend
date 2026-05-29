import { createWasteInput } from '../services/movement-create.js'
import { movementSchema } from '../schemas/movement.js'
import { WasteInput } from '../domain/wasteInput.js'
import Joi from 'joi'
import { HTTP_STATUS, backoffOptions } from 'waste-movement-utils'
import { getOrgIdForApiCode } from '../common/helpers/validate-api-code.js'
import { config } from '../config.js'
import { backOff } from 'exponential-backoff'
import { metricsCounter } from '../common/helpers/metrics.js'
import { handleRouteError } from '../common/helpers/bulk-route-helpers.js'
import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger

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
            [HTTP_STATUS.NO_CONTENT]: {
              description: 'Successfully created waste input'
            },
            [HTTP_STATUS.BAD_REQUEST]: {
              description: 'Bad Request',
              schema: Joi.object({
                statusCode: Joi.number().valid(HTTP_STATUS.BAD_REQUEST),
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
        let requestOrgId

        const { wasteTrackingId } = request.params
        const { submittingOrganisation, apiCode, ...movementData } =
          request.payload.movement
        const wasteInput = new WasteInput()

        wasteInput.wasteTrackingId = wasteTrackingId
        wasteInput.traceId = request.getTraceId()

        if (submittingOrganisation?.defraCustomerOrganisationId) {
          wasteInput.submittingOrganisation = {
            defraCustomerOrganisationId:
              submittingOrganisation.defraCustomerOrganisationId
          }
          wasteInput.receipt = { movement: movementData }
          requestOrgId = submittingOrganisation.defraCustomerOrganisationId
        } else {
          const orgApiCodes = config.get('orgApiCodes')
          requestOrgId = getOrgIdForApiCode(apiCode, orgApiCodes)
          wasteInput.orgId = requestOrgId
          wasteInput.receipt = { movement: { apiCode, ...movementData } }
        }

        await backOff(
          () => createWasteInput(request.db, wasteInput, request.getTraceId()),
          backoffOptions(logger)
        )

        metricsCounter('receiver.orgId', 1, { orgId: requestOrgId })

        return h.response().code(HTTP_STATUS.NO_CONTENT)
      } catch (error) {
        return handleRouteError(h, error)
      }
    }
  }
]

export { createReceiptMovement }
