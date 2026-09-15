import { randomUUID } from 'node:crypto'
import Joi from 'joi'
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
import { handleNewRouteError } from '../../common/helpers/bulk-route-helpers.js'

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
    },
    plugins: {
      'hapi-swagger': {
        params: {},
        responses: {
          [HTTP_STATUS.CREATED]: {
            description:
              'Receipt recorded against the delivery. Body carries the Delivery ID and any validation warnings.',
            schema: Joi.object({
              data: Joi.object({
                deliveryId: Joi.string()
                  .required()
                  .description('The Delivery the receipt is recorded against.')
                  .example('25KMT4Z9')
              }),
              validation: Joi.object({
                warnings: Joi.array().items(Joi.object())
              })
            }).label('RecordReceiptResponse')
          },
          [HTTP_STATUS.NOT_FOUND]: {
            description: 'Delivery not found.'
          },
          [HTTP_STATUS.BAD_REQUEST]: {
            description:
              'The request could not be stored (validation, format or state error).'
          }
        }
      }
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

        return h
          .response({
            statusCode: HTTP_STATUS.NOT_FOUND,
            error: 'Not Found',
            message
          })
          .code(HTTP_STATUS.NOT_FOUND)
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
      return handleNewRouteError(error)
    }
  }
}

export { recordReceipt }
