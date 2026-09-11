import { randomUUID } from 'node:crypto'
import Joi from 'joi'
import { getMovementRecord } from '../../services/movement.js'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrgIdForApiCode } from '../../common/helpers/validate-api-code.js'
import { config } from '../../config.js'
import { createCollectionSchema } from '../../schemas/beta-1.js'
import { notFound } from '@hapi/boom'
import { handleNewRouteError } from '../../common/helpers/bulk-route-helpers.js'

const logger = createLogger()

const createCollection = {
  method: 'POST',
  path: '/movements/{movementId}/collection',
  options: {
    tags: ['movements'],
    description: 'Create a new waste collection',
    validate: {
      payload: createCollectionSchema
    },
    plugins: {
      'hapi-swagger': {
        params: {},
        responses: {
          [HTTP_STATUS.CREATED]: {
            description: 'Successfully created waste collection',
            schema: Joi.object({})
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
    const { apiCode } = request.payload
    const { movementId } = request.params

    try {
      const traceId = getTraceId() || randomUUID()
      getOrgIdForApiCode(apiCode, config.get('orgApiCodes'))
      const movementRecord = await getMovementRecord(request.db, movementId)

      if (!movementRecord) {
        return notFound('movementId not found')
      }

      const response = {
        data: null,
        validation: { warnings: [] }
      }

      logger.info(
        'Successfully created waste movement collection',
        request,
        response
      )

      return h
        .response(response)
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', traceId)
        .message('Successfully created a waste movement collection')
    } catch (error) {
      return handleNewRouteError(error)
    }
  }
}

export { createCollection }
