import { WasteInput } from '../domain/wasteInput.js'
import Joi from 'joi'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { backOff } from 'exponential-backoff'
import { BACKOFF_OPTIONS } from '../common/constants/exponential-backoff.js'
import { createBulkWasteInput } from '../services/movement-create-bulk.js'
import { httpClients } from '../common/helpers/http-client.js'
import { config } from '../config.js'
import { getBatches } from '../common/helpers/batch.js'

const createBulkReceiptMovement = {
  method: 'POST',
  path: '/bulk/{bulkId}/movements/receive',
  options: {
    tags: ['movements', 'bulk-upload'],
    description: 'Create multiple new waste inputs with receipt movements',
    plugins: {
      'hapi-swagger': {
        params: {},
        responses: {
          [HTTP_STATUS_CODES.NO_CONTENT]: {
            description: 'Successfully created waste inputs'
          },
          [HTTP_STATUS_CODES.BAD_REQUEST]: {
            description: 'Bad Request',
            schema: Joi.object({
              statusCode: Joi.number().valid(HTTP_STATUS_CODES.BAD_REQUEST),
              error: Joi.string(),
              message: Joi.string()
            }).label('BadRequestResponse')
          }
        }
      }
    }
  },
  handler: async (request, h) => {
    try {
      const {
        params: { bulkId },
        payload
      } = request
      const wasteInputsCollection = request.db.collection('waste-inputs')
      const wasteInputsHistoryCollection = request.db.collection(
        'waste-inputs-history'
      )

      const filters = { bulkId, revision: 1 }
      const existingWasteInputs = await wasteInputsCollection
        .find(filters)
        .toArray()
        .then((result) =>
          result.length > 0
            ? result
            : wasteInputsHistoryCollection.find(filters).toArray()
        )

      if (existingWasteInputs.length > 0) {
        return existingWasteInputs.map((wasteInput) => ({
          wasteTrackingId: wasteInput.wasteTrackingId
        }))
      }

      const batchSize = config.get('services.wasteTrackingBatchSize')
      const wasteTrackingIds = []
      const payloadBatches = getBatches(batchSize, payload)

      for (const payloadBatch of payloadBatches) {
        const batchWasteTrackingIds = await Promise.all(
          payloadBatch.map(() => httpClients.wasteTracking.get('/next'))
        ).then((results) => {
          return results.map((result) => result.payload.wasteTrackingId)
        })

        wasteTrackingIds.push(...batchWasteTrackingIds)
      }

      if (wasteTrackingIds.length !== payload.length) {
        throw new Error(
          `Created wasteTrackingId count (${wasteTrackingIds.length}) doesn't match the request payload count (${payload.length}) for bulkId (${bulkId})`
        )
      }

      const dateNow = new Date()
      const wasteInputs = payload.map((receipt, index) => {
        const wasteInput = new WasteInput()
        wasteInput.wasteTrackingId = wasteTrackingIds[index]
        wasteInput.receipt = receipt
        wasteInput.orgId = receipt.orgId
        wasteInput.traceId = request.getTraceId()
        wasteInput.bulkId = bulkId
        wasteInput.revision = 1
        wasteInput.createdAt = dateNow
        wasteInput.lastUpdatedAt = dateNow
        return wasteInput
      })

      const createdWasteTrackingIds = await backOff(
        () =>
          createBulkWasteInput(request.db, request.mongoClient, wasteInputs),
        BACKOFF_OPTIONS
      )

      return h.response(createdWasteTrackingIds).code(HTTP_STATUS_CODES.CREATED)
    } catch (error) {
      const statusCode =
        error.statusCode || HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR

      return h
        .response({
          statusCode,
          error: error.name,
          message: error.message
        })
        .code(statusCode)
    }
  }
}

export { createBulkReceiptMovement }
