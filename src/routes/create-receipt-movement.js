import { createWasteInput } from '../services/movement-create.js'
import { movementSchema } from '../schemas/movement.js'
import { headersSchema } from '../schemas/headers.js'
import { WasteInput } from '../domain/wasteInput.js'
import Joi from 'joi'
import {
  HTTP_STATUS,
  METRIC_NAMES,
  backoffOptions
} from '@defra/waste-movement-utils'
import { getOrgIdForApiCode } from '../common/helpers/validate-api-code.js'
import { config } from '../config.js'
import { backOff } from 'exponential-backoff'
import { handleRouteError } from '../common/helpers/bulk-route-helpers.js'
import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger()

const createReceiptMovement = [
  {
    method: 'POST',
    path: '/movements/{wasteTrackingId}/receive',
    options: {
      tags: ['movements'],
      description: 'Create a new waste input with a receipt movement',
      validate: {
        payload: movementSchema,
        headers: headersSchema,
        params: Joi.object({
          wasteTrackingId: Joi.string().required()
        })
      }
    },
    handler: async (request, h) => {
      try {
        const { wasteTrackingId } = request.params
        const { submittingOrganisation, apiCode, ...movementData } =
          request.payload.movement
        const wasteInput = new WasteInput()

        wasteInput.wasteTrackingId = wasteTrackingId
        wasteInput.traceId = request.getTraceId()
        wasteInput.clientId = request.headers['x-dwt-client-id']

        if (submittingOrganisation?.defraCustomerOrganisationId) {
          wasteInput.submittingOrganisation = submittingOrganisation
          wasteInput.receipt = { movement: movementData }
        } else {
          const orgApiCodes = config.get('orgApiCodes')
          wasteInput.orgId = getOrgIdForApiCode(apiCode, orgApiCodes)
          wasteInput.receipt = { movement: { apiCode, ...movementData } }
        }

        await backOff(
          () => createWasteInput(request.db, wasteInput, request.getTraceId()),
          backoffOptions(logger)
        )

        logger.info(`${METRIC_NAMES.RECEIPTS_RECEIVED} - post`)

        return h.response().code(HTTP_STATUS.NO_CONTENT)
      } catch (error) {
        return handleRouteError(h, error)
      }
    }
  }
]

export { createReceiptMovement }
