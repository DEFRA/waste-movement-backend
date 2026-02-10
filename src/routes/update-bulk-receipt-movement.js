import Joi from 'joi'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { backOff } from 'exponential-backoff'
import { BACKOFF_OPTIONS } from '../common/constants/exponential-backoff.js'
import { updateBulkWasteInput } from '../services/movement-update-bulk.js'
import { BULK_RESPONSE_STATUS } from '../common/constants/bulk-response-status.js'

const updateBulkReceiptMovement = {
  method: 'PUT',
  path: '/bulk/{bulkId}/movements/receive',
  options: {
    tags: ['movements', 'bulk-upload'],
    description: 'Update multiple existing waste inputs with receipt movements',
    plugins: {
      'hapi-swagger': {
        params: {},
        responses: {
          [HTTP_STATUS_CODES.OK]: {
            description: 'Successfully updated waste inputs'
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

      const filters = { bulkId, revision: { $gt: 1 } }
      const existingWasteInputs = await wasteInputsCollection
        .find(filters)
        .toArray()
        .then((result) =>
          result.length > 0
            ? result
            : wasteInputsHistoryCollection.find(filters).toArray()
        )

      if (existingWasteInputs.length > 0) {
        return h
          .response({
            status: BULK_RESPONSE_STATUS.NO_MOVEMENTS_UPDATED,
            movements: payload.map(() => ({}))
          })
          .code(HTTP_STATUS_CODES.OK)
      }

      const movements = await backOff(async () => {
        const wasteInputsToUpdate = await Promise.all(
          payload.map((item) =>
            wasteInputsCollection.findOne({ _id: item.wasteTrackingId })
          )
        )

        return updateBulkWasteInput(
          request.db,
          request.mongoClient,
          payload,
          bulkId,
          request.getTraceId(),
          wasteInputsToUpdate
        )
      }, BACKOFF_OPTIONS)

      return h
        .response({
          status: BULK_RESPONSE_STATUS.MOVEMENTS_UPDATED,
          movements
        })
        .code(HTTP_STATUS_CODES.OK)
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

export { updateBulkReceiptMovement }
