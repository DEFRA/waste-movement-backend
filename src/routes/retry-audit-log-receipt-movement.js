import Joi from 'joi'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { auditLogger } from '../common/helpers/logging/audit-logger.js'
import { AUDIT_LOGGER_TYPE } from '../common/constants/audit-logger.js'
import { retryAuditLogSchema } from '../schemas/retry-audit-log.js'

const retryAuditLogReceiptMovement = {
  method: 'POST',
  path: '/movements/retry-audit-log',
  options: {
    tags: ['movements'],
    description: 'Retries the sending of a receipt movement to the audit log',
    validate: {
      payload: retryAuditLogSchema
    },
    plugins: {
      'hapi-swagger': {
        params: {},
        responses: {
          [HTTP_STATUS_CODES.OK]: {
            description:
              'Successfully retried the sending of a receipt movement to the audit log',
            schema: Joi.object({})
          },
          [HTTP_STATUS_CODES.BAD_REQUEST]: {
            description: 'Bad Request',
            schema: Joi.object({
              validation: Joi.object({
                errors: Joi.array()
                  .items(
                    Joi.object({
                      key: Joi.string().description(
                        'The field path that triggered the error'
                      ),
                      errorType: Joi.string().description('The type of error'),
                      message: Joi.string().description('The error message')
                    })
                  )
                  .description('Array of errors')
              })
            })
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

      const filter = {
        ...(traceId ? { traceId } : {}),
        ...(wasteTrackingId && revision ? { wasteTrackingId, revision } : {})
      }

      const wasteInput = await wasteInputsCollection
        .findOne(filter)
        .then(
          (result) => result || wasteInputsHistoryCollection.findOne(filter)
        )

      if (!wasteInput) {
        return h
          .response({
            statusCode: HTTP_STATUS_CODES.NOT_FOUND,
            error: 'Not Found',
            message: `Waste input with values ${JSON.stringify({ traceId, wasteTrackingId, revision })} not found`
          })
          .code(HTTP_STATUS_CODES.NOT_FOUND)
      }

      auditLogger({
        type:
          wasteInput.revision === 1
            ? AUDIT_LOGGER_TYPE.MOVEMENT_CREATED
            : AUDIT_LOGGER_TYPE.MOVEMENT_UPDATED,
        traceId: wasteInput.traceId,
        data: wasteInput,
        shouldThrowError: true
      })

      return h.response({}).code(HTTP_STATUS_CODES.OK)
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

export { retryAuditLogReceiptMovement }
