import { randomUUID } from 'node:crypto'
import {
  createMovementId,
  createMovementRecord
} from '../../services/movement.js'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { backOff } from 'exponential-backoff'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrganisationId } from '../../common/helpers/get-organisation-id.js'
import {
  jsonSchemaRequestValidatorFor,
  jsonSchemaResponseValidatorFor
} from '../../schemas/validate/hapi-validator.js'
import { handleBetaRouteError } from '../../common/helpers/bulk-route-helpers.js'
import { wasteReferenceDataChecks } from '../../common/helpers/waste-reference-data-checks.js'
import { withPayloadChecks } from '../../schemas/validate/payload-checks.js'

const apiVersion = 'beta-2'
const logger = createLogger({ apiVersion })
const validateRequest = jsonSchemaRequestValidatorFor(apiVersion)
const validateResponse = jsonSchemaResponseValidatorFor(apiVersion)

const createMovement = {
  method: 'POST',
  path: '/movements',
  options: {
    description: 'Create a new waste movement',
    validate: {
      payload: withPayloadChecks(
        validateRequest('creation/create-movement-request'),
        wasteReferenceDataChecks
      )
    },
    response: {
      status: { 201: validateResponse('creation/create-movement-response') }
    }
  },
  handler: async (request, h) => {
    try {
      const traceId = getTraceId() || randomUUID()
      const orgId = getOrganisationId(request)
      const movementId = await createMovementId()

      await backOff(
        () =>
          createMovementRecord(request.db, {
            movementId,
            orgId,
            wasteItems: request.payload.wasteItems
          }),
        backoffOptions(createLogger)
      )
      const responseBody = {
        data: { movementId },
        validation: { warnings: [] }
      }

      logger.info(
        { movementId },
        `Successfully created waste movement with id ${movementId}`
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
