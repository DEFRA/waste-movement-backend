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
  apiCode: Joi.string()
    .uuid()
    .required()
    .description('Unique identifier of the submitting organisation.')
    .example('25b14080-5e77-4f91-9957-2482a0cb8775'),
  movementIds: Joi.array()
    .items(Joi.string())
    .min(1)
    .required()
    .description(
      'One or more Movement IDs delivered together at this delivery.'
    )
})
