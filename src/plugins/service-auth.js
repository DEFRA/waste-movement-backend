import Basic from '@hapi/basic'

import { config } from '../config.js'

const serviceAuth = {
  plugin: {
    name: 'service-auth',
    register: async (server) => {
      await server.register(Basic)

      const isLocalEnvironment = config.get('cdpEnvironment') === 'local'
      const serviceCredentials = config.get('serviceCredentials')

      server.auth.strategy('service-token', 'basic', {
        validate: async (_request, username, password) => {
          // Skip validation in local environment
          if (isLocalEnvironment) {
            return { isValid: true, credentials: { username } }
          }

          // Find matching credentials
          const matchingCredential = serviceCredentials.find(
            (cred) => cred.username === username && cred.password === password
          )

          return { isValid: !!matchingCredential, credentials: { username } }
        }
      })

      server.auth.default('service-token')
    }
  }
}

export { serviceAuth }
