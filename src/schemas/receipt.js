import Joi from 'joi'
export const receiptMovementSchema = Joi.object({
  movement: Joi.object().required()
}).label('ReceiptMovement')
