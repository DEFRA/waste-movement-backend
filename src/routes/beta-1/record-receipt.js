import { randomUUID } from 'node:crypto'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { backOff } from 'exponential-backoff'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrgIdForApiCode } from '../../common/helpers/validate-api-code.js'
import { config } from '../../config.js'
import {
  recordReceiptSchema,
  deliveryIdParamsSchema
} from '../../schemas/beta-1.js'
import {
  deliveryExists,
  createDeliveryRecord
} from '../../services/delivery.js'
import {
  getReservation,
  RESERVATION_STATUS
} from '../../services/reservation.js'
import { handleBetaRouteError } from '../../common/helpers/bulk-route-helpers.js'
import { notFound } from '@hapi/boom'

const apiVersion = 'beta-1'
const logger = createLogger({ apiVersion })

const recordReceipt = {
  method: 'POST',
  path: '/deliveries/{deliveryId}/receipt',
  options: {
    tags: ['movements', 'deliveries', 'receipts'],
    description: 'Record receipt of waste against a delivery',
    notes:
      'Records receipt of the waste delivered under the given delivery. If the Delivery ID is a live ' +
      'reservation with no delivery submitted yet (Option A, D-028), creates the awaiting-delivery ' +
      'shell and returns 202 rather than 404 - the carrier has not yet said what was delivered.',
    validate: {
      payload: recordReceiptSchema,
      params: deliveryIdParamsSchema
    }
  },
  handler: async (request, h) => {
    const { deliveryId } = request.params
    const { apiCode } = request.payload

    try {
      const traceId = getTraceId() || randomUUID()
      getOrgIdForApiCode(apiCode, config.get('orgApiCodes'))

      const found = await deliveryExists(request.db, deliveryId)

      if (!found) {
        // The receiver is always a different org from the carrier by
        // definition - no ownership check on this route, see
        // option-a-pre-reserved-delivery-IDs.md, "Ownership and
        // verification".
        const reservation = await getReservation(request.db, deliveryId)

        if (!reservation || reservation.status === RESERVATION_STATUS.VOID) {
          const message = `No delivery exists with delivery ID: ${deliveryId}`
          logger.error({ deliveryId }, message)

          return notFound(message)
        }

        await backOff(
          () =>
            createDeliveryRecord(request.db, {
              deliveryId,
              movementIds: [],
              orgId: reservation.orgId,
              status: 'awaiting_delivery',
              receiptedAt: new Date().toISOString()
            }),
          backoffOptions(logger)
        )

        logger.info(
          `Recorded receipt against reserved delivery ${deliveryId}; carrier has not yet submitted the delivery`,
          { deliveryId }
        )

        return h
          .response({ data: { deliveryId }, validation: { warnings: [] } })
          .code(HTTP_STATUS.ACCEPTED)
          .header('x-request-id', traceId)
          .message('Receipt recorded; delivery is not yet complete')
      }

      logger.info(`Successfully recorded receipt for delivery ${deliveryId}`, {
        deliveryId
      })

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
