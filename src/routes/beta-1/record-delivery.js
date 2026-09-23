import { randomUUID } from 'node:crypto'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { backOff } from 'exponential-backoff'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrgIdForApiCode } from '../../common/helpers/validate-api-code.js'
import { WASTE_TYPE } from '../../common/constants/waste-type.js'
import { config } from '../../config.js'
import { recordDeliverySchema } from '../../schemas/beta-1.js'
import {
  createDeliveryId,
  createDeliveryRecord,
  completeDeliveryRecord,
  getDeliveryRecord
} from '../../services/delivery.js'
import {
  getReservation,
  markReservationUsed,
  RESERVATION_STATUS
} from '../../services/reservation.js'
import { findMovementIds } from '../../services/movement.js'
import { badRequest, notFound, conflict } from '@hapi/boom'
import { handleBetaRouteError } from '../../common/helpers/bulk-route-helpers.js'

const apiVersion = 'beta-1'
const logger = createLogger({ apiVersion })

const sameMovementIds = (a, b) =>
  a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',')

const recordDelivery = {
  method: 'POST',
  path: '/deliveries',
  options: {
    tags: ['movements', 'deliveries'],
    description: 'Record a delivery',
    notes: 'Records a delivery event and returns a Delivery ID.',
    validate: {
      payload: recordDeliverySchema
    }
  },
  handler: async (request, h) => {
    const {
      apiCode,
      movementIds,
      deliveryId: suppliedDeliveryId
    } = request.payload
    const clientId = request.headers['x-dwt-client-id']

    try {
      const traceId = getTraceId() || randomUUID()
      const orgId = getOrgIdForApiCode(apiCode, config.get('orgApiCodes'))

      const foundMovementIds = await findMovementIds(request.db, movementIds)
      const missingMovementIds = movementIds.filter(
        (movementId) => !foundMovementIds.includes(movementId)
      )

      if (missingMovementIds.length > 0) {
        const message = `No movement exists for movement ID(s): ${missingMovementIds.join(', ')}`
        logger.error({ movementIds, missingMovementIds }, message)

        throw badRequest(message)
      }

      // For now, all movements submitted together are bundled into a single
      // delivery and treated as non-hazardous. Splitting a submission into
      // multiple deliveries by waste type is not yet supported.
      const wasteType = WASTE_TYPE.NON_HAZARDOUS

      let deliveryId
      let statusCode = HTTP_STATUS.CREATED

      if (suppliedDeliveryId) {
        // Option A (D-028): submitting against a pre-reserved Delivery ID.
        const reservation = await getReservation(request.db, suppliedDeliveryId)

        if (
          !reservation ||
          reservation.status === RESERVATION_STATUS.VOID ||
          reservation.orgId !== orgId
        ) {
          // Unknown, voided and another org's reservation are deliberately
          // indistinguishable - see option-a-pre-reserved-delivery-IDs.md,
          // "Submit a delivery against a reserved ID".
          throw notFound(
            `No Delivery ID is known matching: ${suppliedDeliveryId}`
          )
        }

        const existingDelivery = await getDeliveryRecord(
          request.db,
          suppliedDeliveryId
        )

        if (existingDelivery?.status === 'complete') {
          if (
            sameMovementIds(existingDelivery.movementIds, movementIds) &&
            existingDelivery.wasteType === wasteType
          ) {
            deliveryId = suppliedDeliveryId
            statusCode = HTTP_STATUS.OK
          } else {
            throw conflict(
              `Delivery ID ${suppliedDeliveryId} has already been submitted with different details`
            )
          }
        } else {
          await backOff(
            () =>
              completeDeliveryRecord(request.db, {
                deliveryId: suppliedDeliveryId,
                movementIds,
                wasteType,
                orgId,
                clientId
              }),
            backoffOptions(logger)
          )
          await markReservationUsed(request.db, suppliedDeliveryId, clientId)
          deliveryId = suppliedDeliveryId
        }
      } else {
        deliveryId = await createDeliveryId()

        await backOff(
          () =>
            createDeliveryRecord(request.db, {
              deliveryId,
              movementIds,
              wasteType,
              orgId,
              clientId,
              status: 'complete'
            }),
          backoffOptions(logger)
        )
      }

      logger.info(`Successfully recorded delivery with id ${deliveryId}`, {
        deliveryId
      })

      return h
        .response({
          data: { deliveries: [{ deliveryId, movementIds, wasteType }] },
          validation: { warnings: [] }
        })
        .code(statusCode)
        .header('x-request-id', traceId)
        .message('Successfully recorded a delivery')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
}

export { recordDelivery }
