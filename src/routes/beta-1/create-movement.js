import Joi from 'joi'
import {
  createMovementId,
  createMovementRecord
} from '../../services/movement.js'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { backOff } from 'exponential-backoff'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrgIdForApiCode } from '../../common/helpers/validate-api-code.js'
import { config } from '../../config.js'
import { createMovementSchema } from '../../schemas/beta-1.js'
import {
  badRequestResponse,
  handleRouteError
} from '../../common/helpers/bulk-route-helpers.js'

const apiVersion = 'beta-1'
const logger = createLogger({ apiVersion })

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
          ...badRequestResponse
        }
      }
    }
  },
  handler: async (request, h) => {
    const { apiCode } = request.payload

    try {
      const traceId = request.getTraceId()
      const orgId = getOrgIdForApiCode(apiCode, config.get('orgApiCodes'))
      const movementId = await createMovementId()

      await backOff(
        () => createMovementRecord(request.db, { movementId, orgId }),
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
      return handleRouteError(h, error)
    }
  }
}

export { createMovement }
