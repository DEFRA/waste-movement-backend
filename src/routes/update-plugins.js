import { HTTP_STATUS } from 'waste-movement-utils'
import Joi from 'joi'

export const updatePlugins = {
  'hapi-swagger': {
    params: {},
    responses: {
      [HTTP_STATUS.OK]: {
        description: 'Successfully updated waste input'
      },
      [HTTP_STATUS.BAD_REQUEST]: {
        description: 'Bad Request',
        schema: Joi.object({
          statusCode: Joi.number().valid(HTTP_STATUS.BAD_REQUEST),
          error: Joi.string(),
          message: Joi.string()
        }).label('BadRequestResponse')
      },
      [HTTP_STATUS.NOT_FOUND]: {
        description: 'Waste input not found',
        schema: Joi.object({
          statusCode: Joi.number().valid(HTTP_STATUS.NOT_FOUND),
          error: Joi.string(),
          message: Joi.string()
        }).label('NotFoundResponse')
      }
    }
  }
}
