import { updateWasteInput } from '../services/movement-update.js'
import { updatePopsSchema } from '../schemas/pops.js'
import Joi from 'joi'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { updatePlugins } from './update-plugins.js'

const updateReceiptMovementPops = {
  method: 'PUT',
  path: '/movements/{wasteTrackingId}/receive/pops',
  options: {
    tags: ['movements'],
    description:
      'Update an existing waste input with POPs (Proof of Processing) details',
    validate: {
      payload: updatePopsSchema,
      params: Joi.object({
        wasteTrackingId: Joi.string().required()
      })
    },
    plugins: updatePlugins
  },
  handler: async (request, h) => {
    const { wasteTrackingId } = request.params
    const updateData = {
      'receipt.pops': request.payload.receipt.pops
    }

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

export { updateReceiptMovementPops }
