import Joi from 'joi'

export const convictValidateOrgApiCodes = {
  name: 'org-api-codes',
  validate: (value) => {
    Joi.assert(
      value,
      Joi.array().items(
        Joi.object({
          apiCode: Joi.string().required().uuid(),
          orgId: Joi.string().required().uuid()
        })
      )
    )
  },
  coerce: (value) =>
    atob(value)
      .split(',')
      .map((orgApiCode) => {
        const orgApiCodeParts = orgApiCode.split('=')
        return { apiCode: orgApiCodeParts[0], orgId: orgApiCodeParts[1] }
      })
}
