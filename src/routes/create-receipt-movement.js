import { createWasteInput } from '../services/movement-create.js'
import { receiptMovementSchema } from '../schemas/receipt.js'
import { WasteInput } from '../domain/wasteInput.js'
import Joi from 'joi'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { getOrgIdForApiCode } from '../common/helpers/validate-api-code.js'
import { config } from '../config.js'
import { backOff } from 'exponential-backoff'
import { BACKOFF_OPTIONS } from '../common/constants/exponential-backoff.js'

const createReceiptMovement = [
  {
    method: 'POST',
    path: '/movements/{wasteTrackingId}/receive',
    options: {
      tags: ['movements'],
      description: 'Create a new waste input with a receipt movement',
      validate: {
        payload: receiptMovementSchema,
        params: Joi.object({
          wasteTrackingId: Joi.string().required()
        })
      },
      plugins: {
        'hapi-swagger': {
          params: {},
          responses: {
            [HTTP_STATUS_CODES.NO_CONTENT]: {
              description: 'Successfully created waste input'
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
        const orgApiCodes = config.get('orgApiCodes')
        const requestOrgId = getOrgIdForApiCode(
          request.payload.movement.apiCode,
          orgApiCodes
        )

        const { wasteTrackingId } = request.params
        const wasteInput = new WasteInput()

        wasteInput.wasteTrackingId = wasteTrackingId
        wasteInput.receipt = request.payload
        wasteInput.orgId = requestOrgId
        wasteInput.traceId = request.getTraceId()

        await backOff(
          () => createWasteInput(request.db, wasteInput, request.getTraceId()),
          BACKOFF_OPTIONS
        )

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

export { createReceiptMovement }
