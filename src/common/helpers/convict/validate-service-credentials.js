import Joi from 'joi'

export const convictValidateServiceCredentials = {
  name: 'service-credentials',
  validate: (value) => {
    if (value === null) return
    Joi.assert(
      value,
      Joi.array().items(
        Joi.object({
          username: Joi.string().required(),
          password: Joi.string().required()
        })
      )
    )
  },
  coerce: (value) => {
    if (value === null || value === undefined) return null
    return atob(value)
      .split(',')
      .map((credential) => {
        const [username, ...passwordParts] = credential.split('=')
        return { username, password: passwordParts.join('=') }
      })
  }
}
