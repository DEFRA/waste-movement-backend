import Joi from 'joi'
import { receiveMovementRequestSchema } from '@defra/waste-movement-utils'

export const movementSchema = Joi.object({
  movement: receiveMovementRequestSchema.required()
}).label('Movement')
