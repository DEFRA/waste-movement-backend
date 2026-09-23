import { randomUUID } from 'node:crypto'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { badRequest, conflict } from '@hapi/boom'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrgIdForApiCode } from '../../common/helpers/validate-api-code.js'
import { config } from '../../config.js'
import { reserveDeliverySchema } from '../../schemas/beta-1.js'
import { createReservationBatch } from '../../services/reservation.js'
import { handleBetaRouteError } from '../../common/helpers/bulk-route-helpers.js'

const apiVersion = 'beta-1'
const logger = createLogger({ apiVersion })

const reserveDelivery = {
  method: 'POST',
  path: '/deliveries/reserve',
  options: {
    tags: ['movements', 'deliveries'],
    description: 'Reserve a batch of Delivery IDs for offline use',
    notes:
      'Mints a batch of Delivery IDs in advance so a driver with no signal can hand one to a ' +
      'receiving site on paper (Option A, D-028). Requires an `Idempotency-Key` header; replaying the ' +
      'same key with the same body returns the original batch rather than minting again.',
    validate: {
      payload: reserveDeliverySchema
    }
  },
  handler: async (request, h) => {
    const { apiCode, count } = request.payload
    const idempotencyKey = request.headers['idempotency-key']
    const clientId = request.headers['x-dwt-client-id']

    try {
      const traceId = getTraceId() || randomUUID()

      if (!idempotencyKey) {
        throw badRequest('Idempotency-Key header is required')
      }

      const orgId = getOrgIdForApiCode(apiCode, config.get('orgApiCodes'))

      const {
        reservations,
        replay,
        replayConflict,
        quotaExceeded,
        outstanding,
        cap
      } = await createReservationBatch(request.db, {
        orgId,
        clientId,
        count,
        idempotencyKey
      })

      if (replayConflict) {
        throw conflict(
          'Idempotency-Key was already used with a different request body'
        )
      }

      if (quotaExceeded) {
        throw conflict(
          `Reserving ${count} more Delivery IDs would exceed the outstanding reservation cap (${outstanding}/${cap})`
        )
      }

      logger.info(
        `${replay ? 'Replayed' : 'Created'} a reservation batch of ${reservations.length} Delivery ID(s) for org ${orgId}`,
        { orgId, count: reservations.length, replay }
      )

      return h
        .response({
          reservations: reservations.map(({ deliveryId, expiresAt }) => ({
            deliveryId,
            expiresAt
          })),
          outstanding,
          cap
        })
        .code(replay ? HTTP_STATUS.OK : HTTP_STATUS.CREATED)
        .header('x-request-id', traceId)
        .message('Successfully reserved Delivery IDs')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
}

export { reserveDelivery }
