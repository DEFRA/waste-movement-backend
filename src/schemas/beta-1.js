import Joi from 'joi'

export const createMovementSchema = Joi.object({
  apiCode: Joi.string()
    .uuid()
    .description('Unique identifier of the submitting organisation.')
    .example('25b14080-5e77-4f91-9957-2482a0cb8775')
    .required()
})
