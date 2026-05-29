import { HTTP_STATUS } from 'waste-movement-utils'
import { handleRouteError } from '../common/helpers/bulk-route-helpers.js'
import { getWasteInputs } from '../services/movement-get.js'
import { getReceiptMovementSchema } from '../schemas/get-receipt-movement.js'
import { notFound } from '@hapi/boom'

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
        return notFound(
          `Waste inputs with values ${JSON.stringify({ wasteTrackingId, bulkId })} not found`
        )
      }

      return h.response(wasteInputs).code(HTTP_STATUS.OK)
    } catch (error) {
      return handleRouteError(h, error)
    }
  }
}

export { getReceiptMovement }
