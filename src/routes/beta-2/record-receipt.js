import { randomUUID } from 'node:crypto'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrganisationId } from '../../common/helpers/get-organisation-id.js'
import {
  jsonSchemaRequestValidatorFor,
  jsonSchemaResponseValidatorFor
} from '../../schemas/validate/hapi-validator.js'
import { findDeliveryMovementIds } from '../../services/delivery.js'
import { handleBetaRouteError } from '../../common/helpers/bulk-route-helpers.js'
import { notFound } from '@hapi/boom'
import {
  emptyIsNotProvided,
  notInFuture
} from '../../common/helpers/date-time-checks.js'
import { withPayloadChecks } from '../../schemas/validate/payload-checks.js'

const apiVersion = 'beta-2'
const logger = createLogger({ apiVersion })
const validateRequest = jsonSchemaRequestValidatorFor(apiVersion)
const validateResponse = jsonSchemaResponseValidatorFor(apiVersion)
const receiptDateTime = ['receiptDateTime']

const recordReceipt = {
  method: 'POST',
  path: '/deliveries/{deliveryId}/receipt',
  options: {
    description: 'Record receipt of waste against a Delivery',
    notes: 'Records receipt of the waste delivered under the given Delivery.',
    app: { journeyStep: 'receipt-recorded' },
    validate: {
      payload: withPayloadChecks(
        validateRequest('receipt/record-receipt-request'),
        emptyIsNotProvided(receiptDateTime),
        notInFuture(receiptDateTime)
      ),
      params: validateRequest('receipt/delivery-id-params')
    },
    response: {
      status: { 201: validateResponse('receipt/record-receipt-response') }
    }
  },
  handler: async (request, h) => {
    const { deliveryId } = request.params

    try {
      const traceId = getTraceId() || randomUUID()
      getOrganisationId(request)

      const movementIds = await findDeliveryMovementIds(request.db, deliveryId)

      if (!movementIds) {
        const message = `No delivery exists with delivery ID: ${deliveryId}`
        logger.error({ deliveryId }, message)

        return notFound(message)
      }

      logger.info(
        { deliveryId },
        `Successfully recorded receipt for delivery ${deliveryId}`
      )
      request.app.journey =
        movementIds.length > 0
          ? movementIds.map((movementId) => ({ movementId, deliveryId }))
          : [{ deliveryId }]

      return h
        .response({ data: { deliveryId }, validation: { warnings: [] } })
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', traceId)
        .message('Successfully recorded a receipt')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
}

export { recordReceipt }
