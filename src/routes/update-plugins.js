import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import Joi from 'joi'

export const updatePlugins = {
  'hapi-swagger': {
    params: {},
    responses: {
      [HTTP_STATUS_CODES.OK]: {
        description: 'Successfully updated waste input'
      },
      [HTTP_STATUS_CODES.BAD_REQUEST]: {
        description: 'Bad Request',
        schema: Joi.object({
          statusCode: Joi.number().valid(HTTP_STATUS_CODES.BAD_REQUEST),
          error: Joi.string(),
          message: Joi.string()
        }).label('BadRequestResponse')
      },
      [HTTP_STATUS_CODES.NOT_FOUND]: {
        description: 'Waste input not found',
        schema: Joi.object({
          statusCode: Joi.number().valid(HTTP_STATUS_CODES.NOT_FOUND),
          error: Joi.string(),
          message: Joi.string()
        }).label('NotFoundResponse')
      }
    }
  }
}
