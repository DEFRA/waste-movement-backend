import Basic from '@hapi/basic'

const serviceAuth = {
  plugin: {
    name: 'service-auth',
    register: async (server) => {
      await server.register(Basic)

      server.auth.strategy('service-token', 'basic', {
        validate: async (_request, username, _password) => {
          const isValid = username !== undefined && username !== ''

          return { isValid, credentials: { clientId: username } }
        }
      })

      server.auth.default('service-token')
    }
  }
}

export { serviceAuth }
