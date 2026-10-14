import { HTTP_STATUS, AUDIT_LOGGER_TYPE } from '@defra/waste-movement-utils'
import { auditLogger } from '../common/helpers/logging/audit-logger.js'
import { retryAuditLogSchema } from '../schemas/retry-audit-log.js'

const retryAuditLogReceiptMovement = {
  method: 'POST',
  path: '/movements/retry-audit-log',
  options: {
    tags: ['movements'],
    description: 'Retries the sending of a receipt movement to the audit log',
    validate: {
      payload: retryAuditLogSchema
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
            statusCode: HTTP_STATUS.NOT_FOUND,
            error: 'Not Found',
            message: `Waste input with values ${JSON.stringify({ traceId, wasteTrackingId, revision })} not found`
          })
          .code(HTTP_STATUS.NOT_FOUND)
      }

      auditLogger({
        type:
          wasteInput.revision === 1
            ? AUDIT_LOGGER_TYPE.MOVEMENT_CREATED
            : AUDIT_LOGGER_TYPE.MOVEMENT_UPDATED,
        traceId: wasteInput.traceId,
        data: wasteInput,
        wasteTrackingId: wasteInput.wasteTrackingId,
        revision: wasteInput.revision,
        shouldThrowError: true
      })

      return h.response({}).code(HTTP_STATUS.OK)
    } catch (error) {
      const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR

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
