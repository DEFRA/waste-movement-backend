import Joi from 'joi'
import { createMovementRecord } from '../../services/movement-create-v2.js'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { backOff } from 'exponential-backoff'
import { httpClients } from '../../common/helpers/http-client.js'
import { handleRouteError } from '../../common/helpers/bulk-route-helpers.js'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrgIdForApiCode } from '../../common/helpers/validate-api-code.js'
import { config } from '../../config.js'
import { createMovementSchema } from '../../schemas/beta-1.js'

const logger = createLogger()

const createMovement = {
  method: 'POST',
  path: '/movements',
  options: {
    tags: ['movements'],
    description: 'Create a new waste movement',
    validate: {
      payload: createMovementSchema
    },
    plugins: {
      'hapi-swagger': {
        params: {},
        responses: {
          [HTTP_STATUS.CREATED]: {
            description: 'Successfully created waste movement',
            schema: Joi.object({
              movementId: Joi.string()
                .required()
                .description(
                  'Unique identifier for a waste movement, minted by the server on `POST /movements`'
                )
                .example('25HRA0B2')
            })
          },
          [HTTP_STATUS.BAD_REQUEST]: {
            description: 'Bad Request',
            schema: Joi.object({
              statusCode: Joi.number().valid(HTTP_STATUS.BAD_REQUEST),
              error: Joi.string(),
              message: Joi.string()
            }).label('BadRequestResponse')
          }
        }
      }
    }
  },
  handler: async (request, h) => {
    const movement = request.payload
    getOrgIdForApiCode(movement.apiCode, config.get('orgApiCodes')) //validate apiCode
    const wasteTrackingResponse = await httpClients.wasteTracking.get('/next')
    const movementId = wasteTrackingResponse.payload.wasteTrackingId
    movement.movementId = movementId

    try {
      await backOff(
        () =>
          createMovementRecord(
            request.db,
            { movementId },
            request.getTraceId()
          ),
        backoffOptions(createLogger)
      )
      const response = { movementId }

      logger.info(
        `Successfully created waste movement with id ${response.movementId}`,
        response
      )

      return h
        .response(response)
        .code(HTTP_STATUS.CREATED)
        .message('Successfully created a waste movement')
    } catch (error) {
      return handleRouteError(h, error)
    }
  }
}

export { createMovement }
