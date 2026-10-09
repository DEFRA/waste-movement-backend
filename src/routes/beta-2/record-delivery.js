import { randomUUID } from 'node:crypto'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { backOff } from 'exponential-backoff'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrganisationId } from '../../common/helpers/get-organisation-id.js'
import { WASTE_TYPE } from '../../common/constants/waste-type.js'
import {
  jsonSchemaRequestValidatorFor,
  jsonSchemaResponseValidatorFor
} from '../../schemas/validate/hapi-validator.js'
import {
  createDeliveryId,
  createDeliveryRecord
} from '../../services/delivery.js'
import { findMovementIds } from '../../services/movement.js'
import { badRequest } from '@hapi/boom'
import { handleBetaRouteError } from '../../common/helpers/bulk-route-helpers.js'

const apiVersion = 'beta-2'
const logger = createLogger({ apiVersion })
const validateRequest = jsonSchemaRequestValidatorFor(apiVersion)
const validateResponse = jsonSchemaResponseValidatorFor(apiVersion)

const recordDelivery = {
  method: 'POST',
  path: '/deliveries',
  options: {
    description: 'Record a delivery',
    notes: 'Records a delivery event and returns a Delivery ID.',
    validate: {
      payload: validateRequest('delivery/record-delivery-request')
    },
    response: {
      status: { 201: validateResponse('delivery/record-delivery-response') }
    }
  },
  handler: async (request, h) => {
    const { movementIds } = request.payload

    try {
      const traceId = getTraceId() || randomUUID()
      const orgId = getOrganisationId(request)

      const foundMovementIds = await findMovementIds(request.db, movementIds)
      const missingMovementIds = movementIds.filter(
        (movementId) => !foundMovementIds.includes(movementId)
      )

      if (missingMovementIds.length > 0) {
        const message = `No movement exists for movement ID(s): ${missingMovementIds.join(', ')}`
        logger.error({ movementIds, missingMovementIds }, message)

        throw badRequest(message)
      }

      const deliveryId = await createDeliveryId()
      // For now, all movements submitted together are bundled into a single
      // delivery and treated as non-hazardous. Splitting a submission into
      // multiple deliveries by waste type is not yet supported.
      const wasteType = WASTE_TYPE.NON_HAZARDOUS

      await backOff(
        () =>
          createDeliveryRecord(request.db, {
            deliveryId,
            movementIds,
            wasteType,
            orgId
          }),
        backoffOptions(logger)
      )

      logger.info(`Successfully recorded delivery with id ${deliveryId}`, {
        deliveryId
      })

      return h
        .response({
          data: { deliveries: [{ deliveryId, movementIds, wasteType }] }
        })
        .code(HTTP_STATUS.CREATED)
        .header('x-request-id', traceId)
        .message('Successfully recorded a delivery')
    } catch (error) {
      return handleBetaRouteError(error)
    }
  }
}

export { recordDelivery }
