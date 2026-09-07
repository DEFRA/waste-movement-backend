import Joi from 'joi'

const apiCode = Joi.string()
  .uuid()
  .description('Unique identifier of the submitting organisation.')
  .example('25b14080-5e77-4f91-9957-2482a0cb8775')
  .required()

export const createMovementSchema = Joi.object({
  apiCode
})

export const createCollectionSchema = Joi.object({
  apiCode
})

export const recordDeliverySchema = Joi.object({
  apiCode,
  movementIds: Joi.array()
    .items(Joi.string())
    .min(1)
    .required()
    .description(
      'One or more Movement IDs delivered together at this delivery.'
    )
})

export const recordReceiptSchema = Joi.object({
  apiCode: Joi.string()
    .uuid()
    .required()
    .description('Unique identifier of the submitting organisation.')
    .example('25b14080-5e77-4f91-9957-2482a0cb8775')
})

export const recordReceiptWithoutDeliverySchema = Joi.object({
  apiCode: Joi.string()
    .uuid()
    .required()
    .description('Unique identifier of the submitting organisation.')
    .example('25b14080-5e77-4f91-9957-2482a0cb8775'),
  reason: Joi.string()
    .required()
    .description(
      'Mandatory explanation for why this receipt is being recorded without a Delivery ID.'
    )
    .example(
      'No delivery was recorded prior to receipt; waste received directly from the producer.'
    )
})

export const deliveryIdParamsSchema = Joi.object({
  deliveryId: Joi.string()
    .required()
    .description('Delivery ID minted by `POST /deliveries`.')
    .example('25KMT4Z9')
})
