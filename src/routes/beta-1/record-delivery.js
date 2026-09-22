import { randomUUID } from 'node:crypto'
import { HTTP_STATUS, backoffOptions } from '@defra/waste-movement-utils'
import { getTraceId } from '@defra/hapi-tracing'
import { backOff } from 'exponential-backoff'
import { createLogger } from '../../common/helpers/logging/logger.js'
import { getOrgIdForApiCode } from '../../common/helpers/validate-api-code.js'
import { WASTE_TYPE } from '../../common/constants/waste-type.js'
import { config } from '../../config.js'
import { jsonSchemaValidatorFor } from '../../schemas/validate/hapi-validator.js'
import {
  createDeliveryId,
  createDeliveryRecord
} from '../../services/delivery.js'
import { findMovementIds } from '../../services/movement.js'
import { badRequest } from '@hapi/boom'
import { handleBetaRouteError } from '../../common/helpers/bulk-route-helpers.js'

const apiVersion = 'beta-1'
const logger = createLogger({ apiVersion })
const validate = jsonSchemaValidatorFor(apiVersion)

const recordDelivery = {
  method: 'POST',
  path: '/deliveries',
  options: {
    description: 'Record a delivery',
    notes: 'Records a delivery event and returns a Delivery ID.',
    validate: {
      payload: validate('record-delivery')
    }
  },
  handler: async (request, h) => {
    const { apiCode, movementIds } = request.payload

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
          data: { deliveries: [{ deliveryId, movementIds, wasteType }] },
          validation: { warnings: [] }
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
