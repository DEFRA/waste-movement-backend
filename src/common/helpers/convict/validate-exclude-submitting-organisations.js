import Joi from 'joi'

export const convictValidateExcludeSubmittingOrganisations = {
  name: 'excluded-submitting-organisations',
  validate: (value) => {
    Joi.assert(value, Joi.array().items(Joi.string().uuid()))
  },
  coerce: (value) =>
    String(value)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
}
