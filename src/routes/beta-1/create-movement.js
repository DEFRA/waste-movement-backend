import Joi from 'joi'
import { createMovementRecord } from '../../services/movement-create-v2.js'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { backOff } from 'exponential-backoff'
import { httpClients } from '../../common/helpers/http-client.js'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrgIdForApiCode } from '../../common/helpers/validate-api-code.js'
import { config } from '../../config.js'
import { createMovementSchema } from '../../schemas/beta-1.js'
import {
  toProblemDetailsResponse,
  failAction
} from '../../common/helpers/errors/problem-details.js'

const apiVersion = 'beta-1'
const logger = createLogger({ apiVersion })

const createMovement = {
  method: 'POST',
  path: '/movements',
  options: {
    tags: ['movements'],
    description: 'Create a new waste movement',
    validate: {
      payload: createMovementSchema,
      failAction
    },
    plugins: {
      'hapi-swagger': {
        params: {},
        responses: {
          [HTTP_STATUS.CREATED]: {
            description: 'Successfully created waste movement',
            schema: Joi.object({
              data: Joi.object({
                movementId: Joi.string()
                  .required()
                  .description(
                    'Unique identifier for a waste movement, minted by the server on `POST /movements`'
                  )
                  .example('25HRA0B2')
              }).required(),
              validation: Joi.object({ warnings: Joi.array() }).required()
            })
          },
          [HTTP_STATUS.BAD_REQUEST]: {
            description: 'Bad Request',
            schema: Joi.object({
              type: Joi.string().required(),
              title: Joi.string().required(),
              detail: Joi.string().required(),
              instance: Joi.string().required(),
              requestId: Joi.string().required(),
              errors: Joi.array().required()
            }).label('BadRequestResponse')
          }
        }
      }
    }
  },
  handler: async (request, h) => {
    try {
      const traceId = request.getTraceId()
      const movement = request.payload
      getOrgIdForApiCode(movement.apiCode, config.get('orgApiCodes')) //validate apiCode
      const wasteTrackingResponse = await httpClients.wasteTracking.get('/next')
      const movementId = wasteTrackingResponse.payload.wasteTrackingId
      movement.movementId = movementId

      await backOff(
        () =>
          createMovementRecord(
            request.db,
            { movementId },
            request.getTraceId()
          ),
        backoffOptions(createLogger)
      )
      const responseBody = {
        data: { movementId },
        validation: { warnings: [] }
      }

      logger.info(
        `Successfully created waste movement with id ${movementId}`,
        responseBody
      )

      return h
        .response(responseBody)
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', traceId)
        .message('Successfully created a waste movement')
    } catch (error) {
      return toProblemDetailsResponse(h, error, {
        instance: `/${apiVersion}/movements`
      })
    }
  }
}

export { createMovement }
