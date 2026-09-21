import { randomUUID } from 'node:crypto'
import {
  createMovementId,
  createMovementRecord
} from '../../services/movement.js'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { backOff } from 'exponential-backoff'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrgIdForApiCode } from '../../common/helpers/validate-api-code.js'
import { config } from '../../config.js'
import { createMovementSchema } from '../../schemas/beta-1.js'
import { handleBetaRouteError } from '../../common/helpers/bulk-route-helpers.js'

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
    }
  },
  handler: async (request, h) => {
    const { apiCode } = request.payload

    try {
      const traceId = getTraceId() || randomUUID()
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
      return handleBetaRouteError(error)
    }
  }
}

export { createMovement }
