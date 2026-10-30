import { randomUUID } from 'node:crypto'
import { getMovementRecord } from '../../services/movement.js'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrganisationId } from '../../common/helpers/get-organisation-id.js'
import {
  jsonSchemaRequestValidatorFor,
  jsonSchemaResponseValidatorFor
} from '../../schemas/validate/hapi-validator.js'
import { notFound } from '@hapi/boom'
import { handleBetaRouteError } from '../../common/helpers/bulk-route-helpers.js'

const apiVersion = 'beta-2'
const logger = createLogger({ apiVersion })
const validateRequest = jsonSchemaRequestValidatorFor(apiVersion)
const validateResponse = jsonSchemaResponseValidatorFor(apiVersion)

const recordCollection = {
  method: 'POST',
  path: '/movements/{movementId}/collection',
  options: {
    description: 'Record the Collection for a Movement',
    app: { journeyStep: 'collection-recorded' },
    validate: {
      payload: validateRequest('collection/record-collection-request'),
      params: validateRequest('collection/movement-id-params')
    },
    response: {
      status: { 201: validateResponse('collection/record-collection-response') }
    }
  },
  handler: async (request, h) => {
    const { movementId } = request.params

    try {
      const traceId = getTraceId() || randomUUID()
      getOrganisationId(request)
      const movementRecord = await getMovementRecord(request.db, movementId)

      if (!movementRecord) {
        return notFound('movementId not found')
      }

      const response = {
        data: null,
        validation: { warnings: [] }
      }

      logger.info(
        { movementId },
        `Successfully created waste movement collection for movement ${movementId}`
      )
      request.app.journey = [{ movementId }]

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

export { recordCollection }
