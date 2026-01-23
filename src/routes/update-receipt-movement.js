import { updateWasteInput } from '../services/movement-update.js'
import { movementSchema } from '../schemas/movement.js'
import Joi from 'joi'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { updatePlugins } from './update-plugins.js'
import { backOff } from 'exponential-backoff'
import { BACKOFF_OPTIONS } from '../common/constants/exponential-backoff.js'

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

      const result = await backOff(
        () =>
          updateWasteInput(
            request.db,
            wasteTrackingId,
            request.payload.movement,
            request.mongoClient,
            request.getTraceId(),
            'receipt.movement'
          ),
        BACKOFF_OPTIONS
      )

      if (result instanceof Error) {
        throw result
      }

      if (result.matchedCount === 0) {
        return h
          .response({
            statusCode: HTTP_STATUS_CODES.NOT_FOUND,
            error: 'Not Found',
            message: `Waste input with ID ${wasteTrackingId} not found`
          })
          .code(HTTP_STATUS_CODES.NOT_FOUND)
      }

      return h.response().code(HTTP_STATUS_CODES.OK)
    } catch (error) {
      const statusCode =
        error.statusCode || HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR

      return h
        .response(
          typeof error.response === 'function'
            ? error.response()
            : {
                statusCode,
                error: error.name,
                message: error.message
              }
        )
        .code(statusCode)
    }
  }
}

export { updateReceiptMovement }
