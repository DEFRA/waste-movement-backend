import { updateWasteInput } from '../services/movement-update.js'
import { receiptMovementSchema } from '../schemas/receipt.js'
import Joi from 'joi'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'

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
    plugins: {
      'hapi-swagger': {
        params: {},
        responses: {
          [HTTP_STATUS_CODES.OK]: {
            description: 'Successfully updated waste input'
          },
          [HTTP_STATUS_CODES.BAD_REQUEST]: {
            description: 'Bad Request',
            schema: Joi.object({
              statusCode: Joi.number().valid(HTTP_STATUS_CODES.BAD_REQUEST),
              error: Joi.string(),
              message: Joi.string()
            }).label('BadRequestResponse')
          },
          [HTTP_STATUS_CODES.NOT_FOUND]: {
            description: 'Waste input not found',
            schema: Joi.object({
              statusCode: Joi.number().valid(HTTP_STATUS_CODES.NOT_FOUND),
              error: Joi.string(),
              message: Joi.string()
            }).label('NotFoundResponse')
          }
        }
      }
    }
  },
  handler: async (request, h) => {
    const { wasteTrackingId } = request.params
    const updateData = { receipt: request.payload }
    const result = await updateWasteInput(
      request.db,
      wasteTrackingId,
      updateData
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
  }
}

export { updateReceiptMovement }
