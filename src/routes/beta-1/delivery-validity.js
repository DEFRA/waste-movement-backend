import { randomUUID } from 'node:crypto'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { notFound } from '@hapi/boom'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { deliveryIdParamsSchema } from '../../schemas/beta-1.js'
import { getDeliveryRecord } from '../../services/delivery.js'
import {
  getReservation,
  effectiveReservationState,
  RESERVATION_STATUS
} from '../../services/reservation.js'
import { handleBetaRouteError } from '../../common/helpers/bulk-route-helpers.js'

const apiVersion = 'beta-1'
const logger = createLogger({ apiVersion })

const DELIVERY_STATUS = {
  AWAITING_DELIVERY: 'awaiting_delivery',
  COMPLETE: 'complete'
}

const deliveryValidity = {
  method: 'GET',
  path: '/deliveries/{deliveryId}/validity',
  options: {
    tags: ['movements', 'deliveries'],
    description:
      'Check whether a Delivery ID is live before accepting waste against it',
    notes:
      'Lets a receiving site confirm, at the counter, that a printed Delivery ID is a real, unvoided ' +
      'reservation or delivery before accepting the waste (Option A, D-028). Deliberately returns no ' +
      "carrier-identifying detail beyond the ID's state.",
    validate: {
      params: deliveryIdParamsSchema
    }
  },
  handler: async (request, h) => {
    const { deliveryId } = request.params

    try {
      const traceId = getTraceId() || randomUUID()

      const [reservation, deliveryRecord] = await Promise.all([
        getReservation(request.db, deliveryId),
        getDeliveryRecord(request.db, deliveryId)
      ])

      if (reservation?.status === RESERVATION_STATUS.VOID) {
        throw notFound(`No Delivery ID is known matching: ${deliveryId}`)
      }

      let state
      if (deliveryRecord?.status === DELIVERY_STATUS.COMPLETE) {
        state = DELIVERY_STATUS.COMPLETE
      } else if (deliveryRecord?.status === DELIVERY_STATUS.AWAITING_DELIVERY) {
        state = DELIVERY_STATUS.AWAITING_DELIVERY
      } else if (reservation) {
        state = effectiveReservationState(reservation)
      } else {
        throw notFound(`No Delivery ID is known matching: ${deliveryId}`)
      }

      logger.info(`Checked validity of delivery ${deliveryId}: ${state}`, {
        deliveryId,
        state
      })

      return h
        .response({
          known: true,
          state,
          // A voided ID never reaches here - it 404s above - so every state
          // that does is acceptable by construction.
          acceptable: true
        })
        .code(HTTP_STATUS.OK)
        .header('x-request-id', traceId)
        .message('Delivery ID validity checked')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
}

export { deliveryValidity }
