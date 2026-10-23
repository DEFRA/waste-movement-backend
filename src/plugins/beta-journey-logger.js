import { createLogger } from '../common/helpers/logging/logger.js'
import { findDeliveryMovementIds } from '../services/delivery.js'

const logger = createLogger()

// CDP's schema caps transaction.id at 256 characters
const MAX_ID_LENGTH = 256
// Bounds the lines written for one request, e.g. a rejected delivery listing
// a very long array of Movement IDs
const MAX_LINES_PER_STEP = 100

const isFailure = (statusCode) => statusCode >= 400

const asIds = (values) =>
  Array.isArray(values)
    ? [
        ...new Set(
          values
            .filter((value) => typeof value === 'string')
            .map((value) => value.slice(0, MAX_ID_LENGTH))
        )
      ]
    : []

/**
 * What each Beta 2 journey step logs: one entry per Movement the step
 * involves, each with the Movement and Delivery ID known for it. A step that
 * involves no known Movement logs a single entry without one.
 */
const STEPS = {
  'post /beta-2/movements': {
    action: 'movement-created',
    ids: async ({ response, statusCode }) =>
      isFailure(statusCode)
        ? []
        : asIds([response.source?.data?.movementId]).map((movementId) => ({
            movementId
          }))
  },
  'post /beta-2/movements/{movementId}/collection': {
    action: 'collection-recorded',
    ids: async ({ request }) =>
      asIds([request.params?.movementId]).map((movementId) => ({
        movementId
      }))
  },
  'post /beta-2/deliveries': {
    action: 'delivery-recorded',
    ids: async ({ request, response, statusCode }) =>
      isFailure(statusCode)
        ? asIds(request.payload?.movementIds).map((movementId) => ({
            movementId
          }))
        : (response.source?.data?.deliveries ?? []).flatMap(
            ({ deliveryId, movementIds }) =>
              asIds(movementIds).map((movementId) => ({
                movementId,
                deliveryId
              }))
          )
  },
  'post /beta-2/deliveries/{deliveryId}/receipt': {
    action: 'receipt-recorded',
    ids: async ({ request }) => {
      const [deliveryId] = asIds([request.params?.deliveryId])
      if (!deliveryId) {
        return []
      }

      const movementIds = await findDeliveryMovementIds(request.db, deliveryId)

      return movementIds.length > 0
        ? movementIds.map((movementId) => ({ movementId, deliveryId }))
        : [{ deliveryId }]
    }
  },
  'post /beta-2/receipts': {
    action: 'undocumented-receipt-recorded',
    ids: async ({ response, statusCode }) =>
      isFailure(statusCode)
        ? []
        : asIds([response.source?.data?.deliveryId]).map((deliveryId) => ({
            deliveryId
          }))
  }
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
        const step = STEPS[`${request.method} ${request.route?.path}`]
        if (!step) {
          return h.continue
        }

        try {
          const { response } = request
          const statusCode = response.isBoom
            ? response.output.statusCode
            : response.statusCode
          const failed = isFailure(statusCode)
          const outcome = failed ? 'failure' : 'success'
          const entries = await step.ids({ request, response, statusCode })

          for (const { movementId, deliveryId } of (entries.length > 0
            ? entries
            : [{}]
          ).slice(0, MAX_LINES_PER_STEP)) {
            logger.info(
              {
                event: { action: step.action, outcome },
                ...(movementId && { transaction: { id: movementId } }),
                ...(deliveryId && { span: { id: deliveryId } }),
                ...(failed && {
                  error: {
                    code: String(statusCode),
                    ...(response.isBoom && { message: response.message })
                  }
                })
              },
              `Beta-2 ${step.action}: ${outcome}${describeIds({ movementId, deliveryId })}`
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
