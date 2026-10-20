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
  createDeliveryRecords
} from '../../services/delivery.js'
import { findMovements } from '../../services/movement.js'
import { isHazardous } from '../../common/helpers/waste-reference-data-checks.js'
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
    notes:
      'Records a delivery event and returns one Delivery for all non-hazardous Movements, plus one per hazardous Movement.',
    validate: {
      payload: validateRequest('delivery/record-delivery-request')
    },
    response: {
      status: { 201: validateResponse('delivery/record-delivery-response') }
    }
  },
  handler: async (request, h) => {
    // A Movement ID submitted twice is only delivered once.
    const movementIds = [...new Set(request.payload.movementIds)]

    try {
      const traceId = getTraceId() || randomUUID()
      const orgId = getOrganisationId(request)

      const movements = await findMovements(request.db, movementIds)
      const movementsById = new Map(
        movements.map((movement) => [movement.movementId, movement])
      )
      const missingMovementIds = movementIds.filter(
        (movementId) => !movementsById.has(movementId)
      )

      if (missingMovementIds.length > 0) {
        const message = `Movement ID(s) not recognised: ${missingMovementIds.join(', ')}`
        logger.error({ movementIds, missingMovementIds }, message)

        throw badRequest(message)
      }

      const deliveries = await splitIntoDeliveries(movementIds, movementsById)

      const recordedDeliveries = await backOff(
        () =>
          createDeliveryRecords(
            request.db,
            request.mongoClient,
            deliveries.map((delivery) => ({ ...delivery, orgId }))
          ),
        backoffOptions(logger)
      )

      const deliveryIds = recordedDeliveries.map(({ deliveryId }) => deliveryId)
      logger.info(
        `Successfully recorded deliveries with ids ${deliveryIds.join(', ')}`,
        { deliveryIds }
      )

      return h
        .response({
          data: { deliveries: recordedDeliveries },
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

/**
 * Groups the submitted movements into deliveries: one minted Delivery for all
 * the non-hazardous movements, then one Delivery per hazardous movement whose
 * Delivery ID is its own Movement ID. A movement is hazardous when any of its
 * waste items declares hazardous properties; one stored without waste items
 * (beta-1, or created before they were stored) is treated as non-hazardous.
 *
 * @param {string[]} movementIds - deduplicated, in submission order
 * @param {Map<string, { wasteItems?: { classification: object }[] }>} movementsById
 * @returns {Promise<{ deliveryId: string, movementIds: string[], wasteType: string }[]>}
 */
const splitIntoDeliveries = async (movementIds, movementsById) => {
  const isHazardousMovement = (movementId) =>
    isHazardous(movementsById.get(movementId))
  const hazardousIds = movementIds.filter(isHazardousMovement)
  const nonHazardousIds = movementIds.filter((id) => !isHazardousMovement(id))

  const hazardousDeliveries = hazardousIds.map((movementId) => ({
    deliveryId: movementId,
    movementIds: [movementId],
    wasteType: WASTE_TYPE.HAZARDOUS
  }))

  if (nonHazardousIds.length === 0) {
    return hazardousDeliveries
  }

  return [
    {
      deliveryId: await createDeliveryId(),
      movementIds: nonHazardousIds,
      wasteType: WASTE_TYPE.NON_HAZARDOUS
    },
    ...hazardousDeliveries
  ]
}

export { recordDelivery }
