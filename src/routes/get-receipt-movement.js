import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { handleRouteError } from '../common/helpers/bulk-route-helpers.js'
import { getWasteInputs } from '../services/movement-get.js'
import { getReceiptMovementSchema } from '../schemas/get-receipt-movement.js'

const getReceiptMovement = {
  method: 'GET',
  path: '/qa-non-prod/movements',
  options: {
    tags: ['movements'],
    description: 'Gets one or more receipt movements',
    validate: {
      query: getReceiptMovementSchema
    }
  },
  handler: async (request, h) => {
    try {
      const { wasteTrackingId, bulkId, includeHistory } = request.query

      const wasteInputs = await getWasteInputs({
        db: request.db,
        wasteTrackingId,
        bulkId,
        includeHistory
      })

      if (wasteInputs.length === 0) {
        return h
          .response({
            statusCode: HTTP_STATUS_CODES.NOT_FOUND,
            error: 'Not Found',
            message: `Waste inputs with values ${JSON.stringify({ wasteTrackingId, bulkId })} not found`
          })
          .code(HTTP_STATUS_CODES.NOT_FOUND)
      }

      return h.response(wasteInputs).code(HTTP_STATUS_CODES.OK)
    } catch (error) {
      return handleRouteError(h, error)
    }
  }
}

export { getReceiptMovement }
