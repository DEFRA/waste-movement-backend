import { WasteInput } from '../domain/wasteInput.js'
import {
  HTTP_STATUS,
  backoffOptions,
  BULK_RESPONSE_STATUS,
  METRIC_NAMES
} from '@defra/waste-movement-utils'
import { backOff } from 'exponential-backoff'
import { createBulkWasteInput } from '../services/movement-create-bulk.js'
import { httpClients } from '../common/helpers/http-client.js'
import { config } from '../config.js'
import { getBatches } from '../common/helpers/batch.js'
import {
  badRequestResponse,
  generateResponseWithValidationWarnings,
  handleRouteError
} from '../common/helpers/bulk-route-helpers.js'
import { bulkReceiveMovementRequestSchema } from '../schemas/bulk-receipt.js'
import Joi from 'joi'
import { createLogger } from '../common/helpers/logging/logger.js'
import { acquireLock } from '../common/helpers/mongo-lock.js'

const logger = createLogger()

const createBulkReceiptMovement = {
  method: 'POST',
  path: '/bulk/{bulkId}/movements/receive',
  options: {
    tags: ['movements', 'bulk-upload'],
    description: 'Create multiple new waste inputs with receipt movements',
    validate: {
      payload: bulkReceiveMovementRequestSchema,
      params: Joi.object({
        bulkId: Joi.string().required()
      })
    },
    plugins: {
      'hapi-swagger': {
        params: {},
        responses: {
          [HTTP_STATUS.NO_CONTENT]: {
            description: 'Successfully created waste inputs'
          },
          ...badRequestResponse
        }
      }
    }
  },
  handler: async (request, h) => {
    try {
      return await createOrReturnExistingMovements(request, h)
    } catch (error) {
      return handleRouteError(h, error)
    }
  }
}

const bulkLockKey = (bulkId) => `bulk-receipt-movement-create-${bulkId}`

const LOCK_CONTENTION_ATTEMPTS = 8
const LOCK_CONTENTION_DELAY_MS = 100
const MAX_LOCK_CONTENTION_DELAY_MS = 800

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Returns the movements already stored against the bulk id, otherwise creates
 * them while holding the bulk id lock.
 *
 * Requests sharing a bulkId must not create concurrently: without the lock both
 * read "no movements yet", both allocate their own waste tracking ids and both
 * insert, leaving two distinct sets of movements for one bulkId.
 *
 * `lock` is non-blocking and yields null while another request holds it, so a
 * request that loses the race waits and re-reads rather than queueing on the
 * lock. By then the winner has committed and the read returns its movements.
 * Only lock contention is retried here — errors raised while creating are left
 * to propagate, since createBulkWasteInput already applies its own backoff.
 *
 * @param {Object} request - The request
 * @param {Object} h - The response toolkit
 *
 * @returns {Promise<Object>} The response
 */
async function createOrReturnExistingMovements(request, h) {
  const { bulkId } = request.params

  for (let attempt = 0; attempt < LOCK_CONTENTION_ATTEMPTS; attempt++) {
    const existingWasteInputs = await findExistingWasteInputs(request, bulkId)

    if (existingWasteInputs.length > 0) {
      return existingMovementsResponse(h, existingWasteInputs)
    }

    const lock = await acquireLock(request.locker, bulkLockKey(bulkId))

    if (lock) {
      try {
        return await createMovementsForBulkId(request, h)
      } finally {
        await lock.free()
      }
    }

    await wait(
      Math.min(
        LOCK_CONTENTION_DELAY_MS * 2 ** attempt,
        MAX_LOCK_CONTENTION_DELAY_MS
      )
    )
  }

  throw new Error(
    `Timed out waiting for the bulk upload in progress for bulkId (${bulkId})`
  )
}

/**
 * Builds the response for a bulk id whose movements already exist.
 *
 * @param {Object} h - The response toolkit
 * @param {Array} existingWasteInputs - The existing waste inputs
 *
 * @returns {Object} The response
 */
function existingMovementsResponse(h, existingWasteInputs) {
  return h
    .response({
      status: BULK_RESPONSE_STATUS.MOVEMENTS_NOT_CREATED,
      movements: existingWasteInputs.map((wasteInput) => ({
        wasteTrackingId: wasteInput.wasteTrackingId
      }))
    })
    .code(HTTP_STATUS.OK)
}

/**
 * Finds the movements already stored against a bulk id, checking the history
 * collection when the current collection holds none.
 *
 * @param {Object} request - The request
 * @param {String} bulkId - The bulk id
 *
 * @returns {Promise<Array>} The existing waste inputs
 */
function findExistingWasteInputs(request, bulkId) {
  const filters = { bulkId, revision: 1 }

  return request.db
    .collection('waste-inputs')
    .find(filters)
    .toArray()
    .then((result) =>
      result.length > 0
        ? result
        : request.db.collection('waste-inputs-history').find(filters).toArray()
    )
}

/**
 * Claims a waste tracking id for every movement in the payload, in batches.
 *
 * @param {Array} payload - The request payload
 * @param {String} bulkId - The bulk id
 *
 * @returns {Promise<Array>} The waste tracking ids
 */
async function allocateWasteTrackingIds(payload, bulkId) {
  const batchSize = config.get('services.wasteTrackingBatchSize')
  const wasteTrackingIds = []
  const payloadBatches = getBatches(batchSize, payload)

  for (const payloadBatch of payloadBatches) {
    const batchWasteTrackingIds = await Promise.all(
      payloadBatch.map(() => httpClients.wasteTracking.get('/next'))
    ).then((results) => {
      return results.map((result) => result?.payload?.wasteTrackingId)
    })

    wasteTrackingIds.push(...batchWasteTrackingIds)
  }

  if (wasteTrackingIds.length !== payload.length) {
    throw new Error(
      `Created wasteTrackingId count (${wasteTrackingIds.length}) doesn't match the request payload count (${payload.length}) for bulkId (${bulkId})`
    )
  }

  return wasteTrackingIds
}

/**
 * Creates the movements for a bulk id, or returns the movements already stored
 * against it. Callers must hold the bulk id lock.
 *
 * @param {Object} request - The request
 * @param {Object} h - The response toolkit
 *
 * @returns {Promise<Object>} The response
 */
async function createMovementsForBulkId(request, h) {
  const {
    params: { bulkId },
    payload
  } = request

  // Re-checked under the lock: a competing request may have committed between
  // the caller's read and this request acquiring the lock.
  const existingWasteInputs = await findExistingWasteInputs(request, bulkId)

  if (existingWasteInputs.length > 0) {
    return existingMovementsResponse(h, existingWasteInputs)
  }

  const wasteTrackingIds = await allocateWasteTrackingIds(payload, bulkId)

  const wasteInputs = createWasteInputs(
    payload,
    wasteTrackingIds,
    request.getTraceId(),
    bulkId
  )

  const createdMovements = await backOff(
    () => createBulkWasteInput(request.db, request.mongoClient, wasteInputs),
    backoffOptions(logger)
  )

  collectLogs(createdMovements)

  const response = generateResponseWithValidationWarnings(
    payload,
    createdMovements.wasteInputs.map(({ wasteTrackingId }) => wasteTrackingId)
  )

  return h
    .response({
      status: createdMovements.status,
      movements: response
    })
    .code(HTTP_STATUS.CREATED)
}

function createWasteInputs(payload, wasteTrackingIds, traceId, bulkId) {
  const dateNow = new Date()
  return payload.map((receipt, index) => {
    const wasteInput = new WasteInput()
    wasteInput.wasteTrackingId = wasteTrackingIds[index]
    wasteInput.receipt = { movement: receipt }
    wasteInput.submittingOrganisation = receipt.submittingOrganisation
    wasteInput.traceId = traceId
    wasteInput.bulkId = bulkId
    wasteInput.revision = 1
    wasteInput.createdAt = dateNow
    wasteInput.lastUpdatedAt = dateNow

    delete wasteInput.receipt.movement.submittingOrganisation

    return wasteInput
  })
}

/**
 * Collects logs for the created movements
 *
 * @param {Object} createdMovements - The created movements
 * @param {String} createdMovements.status - The status of the created movements
 * @param {Object} createdMovements.wasteInputs - The created waste inputs
 *
 * @returns {void}
 */
function collectLogs(createdMovements) {
  if (createdMovements.status === BULK_RESPONSE_STATUS.MOVEMENTS_CREATED) {
    createdMovements.wasteInputs.forEach((wasteInput) => {
      const orgId =
        wasteInput.submittingOrganisation.defraCustomerOrganisationId
      // Specifying the org id in event.reference as it could be different for different
      // movements in a bulk upload and this should override the default org id set for
      // all log messages
      logger.info(
        { event: { reference: orgId } },
        `${METRIC_NAMES.RECEIPTS_RECEIVED_BULK} - post`
      )
    })
  }
}

export { createBulkReceiptMovement }
