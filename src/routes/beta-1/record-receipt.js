import { randomUUID } from 'node:crypto'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrgIdForApiCode } from '../../common/helpers/validate-api-code.js'
import { config } from '../../config.js'
import {
  recordReceiptSchema,
  deliveryIdParamsSchema
} from '../../schemas/beta-1.js'
import { deliveryExists } from '../../services/delivery.js'
import { handleBetaRouteError } from '../../common/helpers/bulk-route-helpers.js'
import { notFound } from '@hapi/boom'

const apiVersion = 'beta-1'
const logger = createLogger({ apiVersion })

const recordReceipt = {
  method: 'POST',
  path: '/deliveries/{deliveryId}/receipt',
  options: {
    tags: ['movements', 'deliveries', 'receipts'],
    description: 'Record receipt of waste against a delivery',
    notes: 'Records receipt of the waste delivered under the given delivery.',
    validate: {
      payload: recordReceiptSchema,
      params: deliveryIdParamsSchema
    }
  },
  handler: async (request, h) => {
    const { deliveryId } = request.params
    const { apiCode } = request.payload

    try {
      const traceId = getTraceId() || randomUUID()
      getOrgIdForApiCode(apiCode, config.get('orgApiCodes'))

      const found = await deliveryExists(request.db, deliveryId)

      if (!found) {
        const message = `No delivery exists with delivery ID: ${deliveryId}`
        logger.error({ deliveryId }, message)

        return notFound(message)
      }

      logger.info(`Successfully recorded receipt for delivery ${deliveryId}`, {
        deliveryId
      })

      return h
        .response({ data: { deliveryId }, validation: { warnings: [] } })
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', traceId)
        .message('Successfully recorded a receipt')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
}

export { recordReceipt }
