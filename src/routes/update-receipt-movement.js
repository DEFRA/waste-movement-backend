import { updateWasteInput } from '../movement-update.js'
import { receiptMovementSchema } from '../schemas/receipt.js'
import Joi from 'joi'

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
          200: {
            description: 'Successfully updated waste input'
          },
          400: {
            description: 'Bad Request',
            schema: Joi.object({
              statusCode: Joi.number().valid(400),
              error: Joi.string(),
              message: Joi.string()
            }).label('BadRequestResponse')
          },
          404: {
            description: 'Waste input not found',
            schema: Joi.object({
              statusCode: Joi.number().valid(404),
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
          statusCode: 404,
          error: 'Not Found',
          message: `Waste input with ID ${wasteTrackingId} not found`
        })
        .code(404)
    }

    return h.response().code(200)
  }
}

export { updateReceiptMovement }
