import { updateWasteInput } from '../services/movement-update.js'
import { movementSchema } from '../schemas/movement.js'
import Joi from 'joi'
import { HTTP_STATUS, backoffOptions } from 'waste-movement-utils'
import { updatePlugins } from './update-plugins.js'
import { backOff } from 'exponential-backoff'
import { getOrganisationValidationError } from '../common/helpers/validate-organisation.js'
import { handleRouteError } from '../common/helpers/bulk-route-helpers.js'
import { createLogger } from '../common/helpers/logging/logger.js'

const logger = createLogger

const updateReceiptMovement = {
  method: 'PUT',
  path: '/movements/{wasteTrackingId}/receive',
  options: {
    tags: ['movements'],
    description:
      'Update an existing waste input with new receipt movement data',
    validate: {
      payload: movementSchema,
      params: Joi.object({
        wasteTrackingId: Joi.string().required()
      })
    },
    plugins: updatePlugins
  },
  handler: async (request, h) => {
    try {
      const { wasteTrackingId } = request.params
      const { submittingOrganisation, ...movementData } =
        request.payload.movement

      const existing = await request.db
        .collection('waste-inputs')
        .findOne({ _id: wasteTrackingId })

      if (!existing) {
        return h
          .response({
            statusCode: HTTP_STATUS.NOT_FOUND,
            error: 'Not Found',
            message: `Waste input with ID ${wasteTrackingId} not found`
          })
          .code(HTTP_STATUS.NOT_FOUND)
      }

      const orgError = getOrganisationValidationError(
        {
          submittingOrganisation,
          apiCode: movementData.apiCode
        },
        existing
      )
      if (orgError) {
        throw orgError
      }

      const result = await backOff(
        () =>
          updateWasteInput(
            request.db,
            wasteTrackingId,
            movementData,
            request.mongoClient,
            request.getTraceId(),
            'receipt.movement',
            submittingOrganisation
          ),
        backoffOptions(logger)
      )

      if (result instanceof Error) {
        throw result
      }

      if (result.matchedCount === 0) {
        return h
          .response({
            statusCode: HTTP_STATUS.NOT_FOUND,
            error: 'Not Found',
            message: `Waste input with ID ${wasteTrackingId} not found`
          })
          .code(HTTP_STATUS.NOT_FOUND)
      }

      return h.response().code(HTTP_STATUS.OK)
    } catch (error) {
      return handleRouteError(h, error)
    }
  }
}

export { updateReceiptMovement }
