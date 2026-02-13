import Joi from 'joi'
import { receiveMovementRequestSchema } from './receipt.js'

export const bulkReceiveMovementRequestSchema = Joi.array()
  .items(receiveMovementRequestSchema)
  .min(1)
  .required()
  .label('BulkReceiveMovementRequest')
