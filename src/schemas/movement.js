import Joi from 'joi'
import { receiveMovementRequestSchema } from './receipt.js'

export const movementSchema = Joi.object({
  movement: receiveMovementRequestSchema.required()
}).label('Movement')
