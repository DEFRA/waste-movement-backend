import Boom from '@hapi/boom'
import { config } from '../config.js'

const serviceAuth = {
  plugin: {
    name: 'service-auth',
    register: async (server) => {
      server.auth.scheme('service-token-scheme', () => {
        return {
          authenticate: (request, h) => {
            const authorization = request.headers.authorization

            if (!authorization) {
              throw Boom.unauthorized('Missing authorization header')
            }

            const [scheme, token] = authorization.split(' ')

            if (scheme?.toLowerCase() !== 'bearer' || !token) {
              throw Boom.unauthorized('Invalid authorization format')
            }

            const expectedToken = config.get('serviceAuthToken')

            if (token !== expectedToken) {
              throw Boom.unauthorized('Invalid token')
            }

            return h.authenticated({ credentials: { token } })
          }
        }
      })

      server.auth.strategy('service-token', 'service-token-scheme')
      server.auth.default('service-token')
    }
  }
}

export { serviceAuth }
