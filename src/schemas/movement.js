import Joi from 'joi'
export const movementSchema = Joi.object({
  movement: Joi.object().required()
}).label('Movement')
