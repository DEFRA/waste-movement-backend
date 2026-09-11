import { randomUUID } from 'node:crypto'
import Joi from 'joi'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { backOff } from 'exponential-backoff'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrgIdForApiCode } from '../../common/helpers/validate-api-code.js'
import { config } from '../../config.js'
import { recordDeliverySchema } from '../../schemas/beta-1.js'
import {
  createDeliveryId,
  createDeliveryRecord
} from '../../services/delivery.js'
import { findMovementIds } from '../../services/movement.js'
import { badRequest } from '@hapi/boom'
import { handleNewRouteError } from '../../common/helpers/bulk-route-helpers.js'

const apiVersion = 'beta-1'
const logger = createLogger({ apiVersion })

const recordDelivery = {
  method: 'POST',
  path: '/deliveries',
  options: {
    tags: ['movements', 'deliveries'],
    description: 'Record a delivery',
    notes: 'Records a delivery event and returns a Delivery ID.',
    validate: {
      payload: recordDeliverySchema
    },
    plugins: {
      'hapi-swagger': {
        params: {},
        responses: {
          [HTTP_STATUS.CREATED]: {
            description:
              'Delivery recorded. Body carries the new Delivery ID and any validation warnings.',
            schema: Joi.object({
              data: Joi.object({
                deliveryId: Joi.string()
                  .required()
                  .description(
                    'Unique identifier for a delivery, minted by the server on `POST /deliveries`'
                  )
                  .example('25KMT4Z9')
              }),
              validation: Joi.object({
                warnings: Joi.array().items(Joi.object())
              })
            }).label('DeliveryResponse')
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
    const { apiCode, movementIds } = request.payload

    try {
      const traceId = getTraceId() || randomUUID()
      const orgId = getOrgIdForApiCode(apiCode, config.get('orgApiCodes'))

      const foundMovementIds = await findMovementIds(request.db, movementIds)
      const missingMovementIds = movementIds.filter(
        (movementId) => !foundMovementIds.includes(movementId)
      )

      if (missingMovementIds.length > 0) {
        const message = `No movement exists for movement ID(s): ${missingMovementIds.join(', ')}`
        logger.error({ movementIds, missingMovementIds }, message)

        throw badRequest(message)
      }

      const deliveryId = await createDeliveryId()

      await backOff(
        () =>
          createDeliveryRecord(request.db, {
            deliveryId,
            movementIds,
            orgId
          }),
        backoffOptions(logger)
      )

      logger.info(`Successfully recorded delivery with id ${deliveryId}`, {
        deliveryId
      })

      return h
        .response({ data: { deliveryId }, validation: { warnings: [] } })
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', traceId)
        .message('Successfully recorded a delivery')
    } catch (error) {
      return handleNewRouteError(error)
    }
  }
}

export { recordDelivery }
