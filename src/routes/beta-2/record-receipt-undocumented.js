import { randomUUID } from 'node:crypto'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { backOff } from 'exponential-backoff'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrganisationId } from '../../common/helpers/get-organisation-id.js'
import {
  jsonSchemaRequestValidatorFor,
  jsonSchemaResponseValidatorFor
} from '../../schemas/validate/hapi-validator.js'
import {
  createDeliveryId,
  createDeliveryRecord
} from '../../services/delivery.js'
import { handleBetaRouteError } from '../../common/helpers/bulk-route-helpers.js'
import { wasteReferenceDataChecks } from '../../common/helpers/waste-reference-data-checks.js'
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

const recordReceiptUndocumented = {
  method: 'POST',
  path: '/receipts',
  options: {
    description: 'Record receipt of undocumented waste',
    notes:
      'Fallback for recording receipt with no prior Delivery, e.g. waste received with no movement ' +
      'trail. Not linked to any Movement; `reasonForNoDeliveryId` must explain why. Creates an empty Delivery behind ' +
      'the scenes and returns its Delivery ID, so the receipt stays addressable.',
    app: { journeyStep: 'undocumented-receipt-recorded' },
    validate: {
      payload: withPayloadChecks(
        validateRequest('receipt/record-receipt-undocumented-request'),
        wasteReferenceDataChecks,
        emptyIsNotProvided(receiptDateTime),
        notInFuture(receiptDateTime)
      )
    },
    response: {
      status: {
        201: validateResponse('receipt/record-receipt-undocumented-response')
      }
    }
  },
  handler: async (request, h) => {
    try {
      const traceId = getTraceId() || randomUUID()
      const orgId = getOrganisationId(request)
      const deliveryId = await createDeliveryId()

      await backOff(
        () =>
          createDeliveryRecord(request.db, {
            deliveryId,
            movementIds: [],
            orgId
          }),
        backoffOptions(logger)
      )

      logger.info(
        { deliveryId },
        `Successfully recorded an undocumented receipt, created delivery ${deliveryId}`
      )
      request.app.journey = [{ deliveryId }]

      return h
        .response({ data: { deliveryId }, validation: { warnings: [] } })
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', traceId)
        .message('Successfully recorded an undocumented receipt')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
}

export { recordReceiptUndocumented }
