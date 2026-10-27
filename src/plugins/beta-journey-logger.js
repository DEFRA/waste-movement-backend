import { createLogger } from '../common/helpers/logging/logger.js'
import { findDeliveryMovementIds } from '../services/delivery.js'

const logger = createLogger()

// CDP's schema caps transaction.id at 256 characters
const MAX_ID_LENGTH = 256
// Bounds the lines written for one request, e.g. a rejected delivery listing
// a very long array of Movement IDs
const MAX_LINES_PER_STEP = 100

const isFailure = (statusCode) => statusCode >= 400

const asId = (value) =>
  typeof value === 'string' ? value.slice(0, MAX_ID_LENGTH) : undefined

const asIds = (values) =>
  Array.isArray(values) ? [...new Set(values.map(asId).filter(Boolean))] : []

/**
 * The Movement and Delivery IDs the handler set on request.app.journey, or,
 * when it didn't get that far (e.g. a validation error), the ones in the
 * request: the movementId param, the payload's movementIds, or the
 * deliveryId param with the Movements delivered under it.
 */
const journeyEntries = async (request) => {
  if (Array.isArray(request.app.journey)) {
    return request.app.journey
      .map(({ movementId, deliveryId } = {}) => ({
        movementId: asId(movementId),
        deliveryId: asId(deliveryId)
      }))
      .filter(({ movementId, deliveryId }) => movementId || deliveryId)
  }

  const { params, payload } = request
  const deliveryId = asId(params?.deliveryId)
  const movementIds = asIds([
    params?.movementId,
    ...(Array.isArray(payload?.movementIds) ? payload.movementIds : [])
  ])

  if (movementIds.length > 0 || !deliveryId) {
    return movementIds.map((movementId) => ({ movementId, deliveryId }))
  }

  const deliveredIds = asIds(
    await findDeliveryMovementIds(request.db, deliveryId)
  )

  return deliveredIds.length > 0
    ? deliveredIds.map((movementId) => ({ movementId, deliveryId }))
    : [{ deliveryId }]
}

const describeIds = ({ movementId, deliveryId }) => {
  const parts = [
    movementId && `movement ${movementId}`,
    deliveryId && `delivery ${deliveryId}`
  ].filter(Boolean)

  return parts.length > 0 ? ` (${parts.join(', ')})` : ''
}

/**
 * Logs each Beta 2 journey step, on success and on failure (including
 * validation errors), so a Movement can be followed from creation to receipt
 * in OpenSearch.
 *
 * A route opts in by naming its step in its config, and its handler sets the
 * IDs it involves on success:
 *
 *   options: { app: { journeyStep: 'delivery-recorded' } }
 *   request.app.journey = [{ movementId, deliveryId }]
 *
 * One line is logged per Movement the step involves, in CDP allowlisted ECS
 * fields (cdp-documentation how-to/logging.md):
 * - transaction.id: the Movement ID (keyword-mapped, so dashboards filter on it)
 * - span.id: the Delivery ID (text only: searchable, not aggregatable)
 * - event.action / event.outcome: the step and whether it succeeded
 * - error.code / error.message: the status and reason, on failure
 *
 * The lines carry no url.path or http.response.status_code, so dashboards
 * counting "request completed" lines don't count them too.
 */
export const betaJourneyLogger = {
  plugin: {
    name: 'beta-journey-logger',
    register(server) {
      server.ext('onPreResponse', async (request, h) => {
        const action = request.route?.settings?.app?.journeyStep
        if (!action) {
          return h.continue
        }

        try {
          const { response } = request
          const statusCode = response.isBoom
            ? response.output.statusCode
            : response.statusCode
          const failed = isFailure(statusCode)
          const outcome = failed ? 'failure' : 'success'
          const entries = await journeyEntries(request)

          for (const { movementId, deliveryId } of (entries.length > 0
            ? entries
            : [{}]
          ).slice(0, MAX_LINES_PER_STEP)) {
            logger.info(
              {
                event: { action, outcome },
                ...(movementId && { transaction: { id: movementId } }),
                ...(deliveryId && { span: { id: deliveryId } }),
                ...(failed && {
                  error: {
                    code: String(statusCode),
                    ...(response.isBoom && { message: response.message })
                  }
                })
              },
              `Beta-2 ${action}: ${outcome}${describeIds({ movementId, deliveryId })}`
            )
          }
        } catch (error) {
          // Never fail the request because its journey line couldn't be logged
          logger.warn({ err: error }, 'Failed to log beta-2 journey step')
        }

        return h.continue
      })
    }
  }
}
