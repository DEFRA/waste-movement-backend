import Joi from 'joi'
import { HTTP_STATUS_CODES } from '../constants/http-status-codes.js'

const badRequestResponse = {
  [HTTP_STATUS_CODES.BAD_REQUEST]: {
    description: 'Bad Request',
    schema: Joi.object({
      statusCode: Joi.number().valid(HTTP_STATUS_CODES.BAD_REQUEST),
      error: Joi.string(),
      message: Joi.string()
    }).label('BadRequestResponse')
  }
}

function handleRouteError(h, error) {
  const statusCode = error.statusCode || HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR

  return h
    .response({
      statusCode,
      error: error.name,
      message: error.message
    })
    .code(statusCode)
}

export { badRequestResponse, handleRouteError }
