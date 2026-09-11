import { randomUUID } from 'node:crypto'
import Joi from 'joi'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { backOff } from 'exponential-backoff'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrgIdForApiCode } from '../../common/helpers/validate-api-code.js'
import { handleRouteError } from '../../common/helpers/bulk-route-helpers.js'
import { WASTE_TYPE } from '../../common/constants/waste-type.js'
import { config } from '../../config.js'
import { recordDeliverySchema } from '../../schemas/beta-1.js'
import {
  createDeliveryId,
  createDeliveryRecord
} from '../../services/delivery.js'
import { findMovementIds } from '../../services/movement.js'

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
              'Delivery recorded. Body carries the new Delivery ID(s) and any validation warnings.',
            schema: Joi.object({
              data: Joi.object({
                deliveries: Joi.array()
                  .items(
                    Joi.object({
                      deliveryId: Joi.string()
                        .required()
                        .description(
                          'Unique identifier for a delivery, minted by the server on `POST /deliveries`'
                        )
                        .example('25KMT4Z9'),
                      movementIds: Joi.array()
                        .items(Joi.string())
                        .required()
                        .description(
                          'The Movement IDs bundled into this delivery.'
                        )
                        .example(['25HRA0B2', '25TKP3C9']),
                      wasteType: Joi.string()
                        .valid(...Object.values(WASTE_TYPE))
                        .required()
                        .description('The waste type of this delivery.')
                        .example(WASTE_TYPE.NON_HAZARDOUS)
                    })
                  )
                  .required()
              }).required(),
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

        const error = new Error(message)
        error.statusCode = HTTP_STATUS.BAD_REQUEST
        throw error
      }

      const deliveryId = await createDeliveryId()
      // For now, all movements submitted together are bundled into a single
      // delivery and treated as non-hazardous. Splitting a submission into
      // multiple deliveries by waste type is not yet supported.
      const wasteType = WASTE_TYPE.NON_HAZARDOUS

      await backOff(
        () =>
          createDeliveryRecord(request.db, {
            deliveryId,
            movementIds,
            wasteType,
            orgId
          }),
        backoffOptions(logger)
      )

      logger.info(`Successfully recorded delivery with id ${deliveryId}`, {
        deliveryId
      })

      return h
        .response({
          data: { deliveries: [{ deliveryId, movementIds, wasteType }] },
          validation: { warnings: [] }
        })
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', traceId)
        .message('Successfully recorded a delivery')
    } catch (error) {
      return handleRouteError(h, error)
    }
  }
}

export { recordDelivery }
