import { createWasteInput } from '../services/movement-create.js'
import { receiptMovementSchema } from '../schemas/receipt.js'
import { WasteInput } from '../domain/wasteInput.js'
import Joi from 'joi'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'

const createReceiptMovement = [
  {
    method: 'POST',
    path: '/movements/{wasteTrackingId}/receive',
    options: {
      tags: ['movements'],
      description: 'Create a new waste input with a receipt movement',
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
      const { wasteTrackingId } = request.params
      const wasteInput = new WasteInput()
      wasteInput.wasteTrackingId = wasteTrackingId
      wasteInput.receipt = request.payload
      await createWasteInput(request.db, wasteInput)
      return h.response().code(HTTP_STATUS_CODES.NO_CONTENT)
    }
  }
]

export { createReceiptMovement }
