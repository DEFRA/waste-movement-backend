import { randomUUID } from 'node:crypto'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrganisationIdFromHeaders } from '../../common/helpers/get-organisation-id.js'
import { jsonSchemaValidatorFor } from '../../schemas/validate/hapi-validator.js'
import { deliveryExists } from '../../services/delivery.js'
import { handleBetaRouteError } from '../../common/helpers/bulk-route-helpers.js'
import { notFound } from '@hapi/boom'

const apiVersion = 'beta-1'
const logger = createLogger({ apiVersion })
const validate = jsonSchemaValidatorFor(apiVersion)

const recordReceipt = {
  method: 'POST',
  path: '/deliveries/{deliveryId}/receipt',
  options: {
    description: 'Record receipt of waste against a delivery',
    notes: 'Records receipt of the waste delivered under the given delivery.',
    validate: {
      payload: validate('record-receipt'),
      params: validate('delivery-id-params')
    }
  },
  handler: async (request, h) => {
    const { deliveryId } = request.params

    try {
      const traceId = getTraceId() || randomUUID()
      getOrganisationIdFromHeaders(request.headers)

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
