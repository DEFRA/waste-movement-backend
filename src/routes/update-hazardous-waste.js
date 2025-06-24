import { updateWasteInput } from '../services/movement-update.js'
import { updateHazardousWasteSchema } from '../schemas/hazardous-waste.js'
import Joi from 'joi'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { updatePlugins } from './update-plugins.js'

const updateHazardousWaste = {
  method: 'PUT',
  path: '/movements/{wasteTrackingId}/receive/hazardous',
  options: {
    tags: ['movements'],
    description: 'Update an existing waste input with hazardous waste details',
    validate: {
      payload: updateHazardousWasteSchema,
      params: Joi.object({
        wasteTrackingId: Joi.string().required()
      })
    },
    plugins: updatePlugins
  },
  handler: async (request, h) => {
    try {
      const { wasteTrackingId } = request.params
      const updateData = {
        'receipt.hazardousWaste': request.payload
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
    } catch (error) {
      return h
        .response({
          statusCode: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
          error: 'Unexpected error',
          message: error.message
        })
        .code(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR)
    }
  }
}

export { updateHazardousWaste }
