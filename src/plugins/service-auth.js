import Basic from '@hapi/basic'
import { config } from '../config.js'

const serviceAuth = {
  plugin: {
    name: 'service-auth',
    register: async (server) => {
      await server.register(Basic)

      server.auth.strategy('service-token', 'basic', {
        validate: async (_request, _username, password) => {
          const expectedToken = config.get('serviceAuthToken')
          const isValid = password === expectedToken

          return { isValid, credentials: { token: password } }
        }
      })

      server.auth.default('service-token')
    }
  }
}

export { serviceAuth }
