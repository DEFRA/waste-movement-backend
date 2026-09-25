import { randomUUID } from 'node:crypto'
import {
  createMovementId,
  createMovementRecord
} from '../../services/movement.js'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { backOff } from 'exponential-backoff'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrganisationIdFromHeaders } from '../../common/helpers/get-organisation-id.js'
import { jsonSchemaValidatorFor } from '../../schemas/validate/hapi-validator.js'
import { handleBetaRouteError } from '../../common/helpers/bulk-route-helpers.js'

const apiVersion = 'beta-2'
const logger = createLogger({ apiVersion })
const validate = jsonSchemaValidatorFor(apiVersion)

const createMovement = {
  method: 'POST',
  path: '/movements',
  options: {
    description: 'Create a new waste movement',
    validate: {
      payload: validate('creation/create-movement')
    }
  },
  handler: async (request, h) => {
    try {
      const traceId = getTraceId() || randomUUID()
      const orgId = getOrganisationIdFromHeaders(request.headers)
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
