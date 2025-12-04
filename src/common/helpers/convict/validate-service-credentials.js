import Joi from 'joi'

export const convictValidateServiceCredentials = {
  name: 'service-credentials',
  validate: (value) => {
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
  coerce: (value) =>
    atob(value)
      .split(',')
      .map((credential) => {
        const [username, ...passwordParts] = credential.split('=')
        return { username, password: passwordParts.join('=') }
      })
}
