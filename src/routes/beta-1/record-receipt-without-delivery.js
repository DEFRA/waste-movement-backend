import { randomUUID } from 'node:crypto'
import Joi from 'joi'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { backOff } from 'exponential-backoff'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrgIdForApiCode } from '../../common/helpers/validate-api-code.js'
import { handleRouteError } from '../../common/helpers/bulk-route-helpers.js'
import { config } from '../../config.js'
import { recordReceiptWithoutDeliverySchema } from '../../schemas/beta-1.js'
import {
  createDeliveryId,
  createDeliveryRecord
} from '../../services/delivery.js'

const apiVersion = 'beta-1'
const logger = createLogger({ apiVersion })

const recordReceiptWithoutDelivery = {
  method: 'POST',
  path: '/receipts',
  options: {
    tags: ['movements', 'deliveries', 'receipts'],
    description: 'Record receipt of waste without a Delivery ID',
    notes:
      'Fallback for recording receipt with no prior Delivery, e.g. waste received with no movement ' +
      'trail. Not linked to any Movement; `reason` must explain why. Creates an empty Delivery behind ' +
      'the scenes and returns its Delivery ID, so the receipt stays addressable.',
    validate: {
      payload: recordReceiptWithoutDeliverySchema
    },
    plugins: {
      'hapi-swagger': {
        params: {},
        responses: {
          [HTTP_STATUS.CREATED]: {
            description:
              'Receipt recorded against a server-created empty Delivery. Body carries the new Delivery ID and any validation warnings.',
            schema: Joi.object({
              data: Joi.object({
                deliveryId: Joi.string()
                  .required()
                  .description(
                    'The new, empty Delivery minted for this receipt.'
                  )
                  .example('25KMT4Z9')
              }),
              validation: Joi.object({
                warnings: Joi.array().items(Joi.object())
              })
            }).label('RecordReceiptWithoutDeliveryResponse')
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
    const { apiCode } = request.payload

    try {
      const traceId = getTraceId() || randomUUID()
      const orgId = getOrgIdForApiCode(apiCode, config.get('orgApiCodes'))
      const deliveryId = await createDeliveryId()

      await backOff(
        () =>
          createDeliveryRecord(request.db, {
            deliveryId,
            movementIds: [],
            orgId
          }),
        backoffOptions(logger)
      )

      logger.info(
        `Successfully recorded receipt without a delivery, created delivery ${deliveryId}`,
        { deliveryId }
      )

      return h
        .response({ data: { deliveryId }, validation: { warnings: [] } })
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', traceId)
        .message('Successfully recorded a receipt without a delivery')
    } catch (error) {
      return handleRouteError(h, error)
    }
  }
}

export { recordReceiptWithoutDelivery }
