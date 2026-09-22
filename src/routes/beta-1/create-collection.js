import { randomUUID } from 'node:crypto'
import { getMovementRecord } from '../../services/movement.js'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrgIdForApiCode } from '../../common/helpers/validate-api-code.js'
import { config } from '../../config.js'
import { jsonSchemaValidator } from '../../schemas/validate/hapi-validator.js'
import { notFound } from '@hapi/boom'
import { handleBetaRouteError } from '../../common/helpers/bulk-route-helpers.js'

const logger = createLogger()

const createCollection = {
  method: 'POST',
  path: '/movements/{movementId}/collection',
  options: {
    description: 'Create a new waste collection',
    validate: {
      payload: jsonSchemaValidator('beta-1/create-collection.schema.json')
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
      return handleBetaRouteError(error)
    }
  }
}

export { createCollection }
