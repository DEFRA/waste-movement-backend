import Joi from 'joi'
import {
  HTTP_STATUS,
  generateAllValidationWarnings
} from 'waste-movement-utils'
import { MongoServerError } from 'mongodb'
import { createLogger } from '../helpers/logging/logger.js'

const logger = createLogger()

const badRequestResponse = {
  [HTTP_STATUS.BAD_REQUEST]: {
    description: 'Bad Request',
    schema: Joi.object({
      statusCode: Joi.number().valid(HTTP_STATUS.BAD_REQUEST),
      error: Joi.string(),
      message: Joi.string()
    }).label('BadRequestResponse')
  }
}

function handleRouteError(h, error) {
  let statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR
  let errorName = error.name
  let message = error.message

  /*
   * Format Mongo schema validation errors.
   *
   * This is an initial implementation to return information detailing why the validation failed.
   *
   * The errors are not formatted the same as the other validation errors as that would be a large
   * chunk of work but should at least give an indication as to why the validation failed.
   *
   * Generally these errors should get caugut by testing before changes get deployed to users.
   *
   * This will return the specific errors and the full error will be in the logs.
   */
  if (
    error instanceof MongoServerError &&
    message === 'Document failed validation'
  ) {
    statusCode = HTTP_STATUS.BAD_REQUEST
    errorName = 'ValidationError'
    message = JSON.stringify(
      error.errorResponse.errInfo
        ? error.errorResponse.errInfo.details.schemaRulesNotSatisfied // Single request
        : error.errorResponse.writeErrors.map(({ err }) => err.errInfo) // Bulk upload
    )
  }

  return h
    .response(
      typeof error.response === 'function'
        ? error.response()
        : {
            statusCode,
            error: errorName,
            message
          }
    )
    .code(statusCode)
}

function generateResponseWithValidationWarnings(payload, wasteTrackingIds) {
  return payload.map((item, index) => {
    const wasteTrackingId = wasteTrackingIds?.[index] ?? item.wasteTrackingId
    const response = wasteTrackingIds ? { wasteTrackingId } : {}
    const warnings = generateAllValidationWarnings(
      item,
      wasteTrackingId,
      logger
    )

    if (warnings.length > 0) {
      response.validation = { warnings }
    }

    return response
  })
}

export {
  badRequestResponse,
  handleRouteError,
  generateResponseWithValidationWarnings
}
