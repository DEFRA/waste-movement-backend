import Joi from 'joi'

const joiHeaders = Joi.defaults((schema) =>
  schema.options({
    allowUnknown: true
  })
)

export const headersSchema = joiHeaders
  .object({
    'x-dwt-client-id': Joi.string().required()
  })
  .messages({ 'any.required': '{{ #label }} is a required header' })
