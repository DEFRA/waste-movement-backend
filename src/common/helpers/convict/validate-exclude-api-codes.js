import Joi from 'joi'

export const convictValidateExcludeApiCodes = {
  name: 'exclude-api-codes',
  validate: (value) => {
    Joi.assert(value, Joi.array().items(Joi.string().uuid()))
  },
  coerce: (value) =>
    String(value)
      .split(',')
      .map((apiCode) => apiCode.trim())
      .filter(Boolean)
}
