import { updateWasteInput } from '../services/movement-update.js'
import { receiptMovementSchema } from '../schemas/receipt.js'
import Joi from 'joi'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { updatePlugins } from './update-plugins.js'
import { validateRequestOrgIdMatchesOriginalOrgId } from '../common/helpers/validate-api-code.js'
import { config } from '../config.js'

const updateReceiptMovement = {
  method: 'PUT',
  path: '/movements/{wasteTrackingId}/receive',
  options: {
    tags: ['movements'],
    description:
      'Update an existing waste input with new receipt movement data',
    validate: {
      payload: receiptMovementSchema,
      params: Joi.object({
        wasteTrackingId: Joi.string().required()
      })
    },
    plugins: updatePlugins
  },
  handler: async (request, h) => {
    try {
      const { wasteTrackingId } = request.params
      const orgApiCodes = config.get('orgApiCodes')

      await validateRequestOrgIdMatchesOriginalOrgId(
        request.payload.movement.apiCode,
        wasteTrackingId,
        request.db,
        orgApiCodes
      )

      const result = await updateWasteInput(
        request.db,
        wasteTrackingId,
        request.payload.movement,
        'receipt.movement',
        request.mongoClient
      )

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
