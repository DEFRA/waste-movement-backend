import Joi from 'joi'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { auditLogger } from '../common/helpers/logging/audit-logger.js'
import { AUDIT_LOGGER_TYPE } from '../common/constants/audit-logger.js'

const retryAuditLogReceiptMovement = [
  {
    method: 'POST',
    path: '/movements/retry-audit-log',
    options: {
      tags: ['movements'],
      description:
        'Retries sending a receipt movement to the audit log, payload is required to contain only traceId or both wasteTrackingId and revision',
      validate: {
        payload: Joi.object({
          traceId: Joi.string(),
          wasteTrackingId: Joi.string(),
          revision: Joi.number()
        }).custom((value, helpers) => {})
      },
      plugins: {
        'hapi-swagger': {
          params: {},
          responses: {
            [HTTP_STATUS_CODES.NO_CONTENT]: {
              description: 'Successfully retried waste movement'
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
        const { traceId, wasteTrackingId, revision } = request.payload
        const wasteInputsCollection = request.db.collection('waste-inputs')
        const wasteInputsHistoryCollection = request.db.collection(
          'waste-inputs-history'
        )

        let filter

        if (traceId) {
          filter = { traceId }
        }

        if (wasteTrackingId && revision) {
          filter = { _id: wasteTrackingId, revision }
        }

        const existingWasteInput = await wasteInputsCollection
          .findOne(filter)
          .then(
            (wasteInput) =>
              wasteInput || wasteInputsHistoryCollection.findOne(filter)
          )

        if (!existingWasteInput) {
          return h
            .response({
              statusCode: HTTP_STATUS_CODES.NOT_FOUND,
              error: 'Not Found',
              message: `Waste input with values ${JSON.stringify({ traceId, _id: wasteTrackingId, revision })} not found`
            })
            .code(HTTP_STATUS_CODES.NOT_FOUND)
        }

        auditLogger({
          type:
            existingWasteInput.revision === 1
              ? AUDIT_LOGGER_TYPE.MOVEMENT_CREATED
              : AUDIT_LOGGER_TYPE.MOVEMENT_UPDATED,
          traceId: existingWasteInput.traceId,
          data: existingWasteInput
        })

        return h.response().code(HTTP_STATUS_CODES.NO_CONTENT)
      } catch (error) {
        const statusCode =
          error.statusCode || HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR

        return h
          .response(
            typeof error.response === 'function'
              ? error.response()
              : {
                  statusCode,
                  error: error.name,
                  message: error.message
                }
          )
          .code(statusCode)
      }
    }
  }
]

export { retryAuditLogReceiptMovement }
