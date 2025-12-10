import Hapi from '@hapi/hapi'
import Basic from '@hapi/basic'
import Inert from '@hapi/inert'
import Vision from '@hapi/vision'

import { config } from './config.js'
import { router } from './plugins/router.js'
import { requestLogger } from './common/helpers/logging/request-logger.js'
import { mongoDb } from './common/helpers/mongodb.js'
import { failAction } from './common/helpers/fail-action.js'
import { secureContext } from './common/helpers/secure-context/index.js'
import { pulse } from './common/helpers/pulse.js'
import { requestTracing } from './common/helpers/request-tracing.js'
import { setupProxy } from './common/helpers/proxy/setup-proxy.js'
import { swagger } from './plugins/swagger.js'

async function createServer() {
  setupProxy()
  const server = Hapi.server({
    host: config.get('host'),
    port: config.get('port'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        },
        failAction
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      },
      cors: {
        origin: ['*'],
        additionalHeaders: [
          'accept',
          'authorization',
          'content-type',
          'x-requested-with',
          'x-api-key'
        ],
        additionalExposedHeaders: [
          'accept',
          'authorization',
          'content-type',
          'x-requested-with',
          'x-api-key'
        ],
        credentials: true
      }
    },
    router: {
      stripTrailingSlash: true
    }
  })

  // Register Vision and Inert first as they are required by Swagger
  await server.register([
    {
      plugin: Inert
    },
    {
      plugin: Vision
    }
  ])

  // Register Swagger before routes
  await server.register(swagger)

  // Register Basic auth and configure strategy
  await server.register(Basic)

  const serviceCredentials = config.get('serviceCredentials')

  server.auth.strategy('service-token', 'basic', {
    validate: async (_request, username, password) => {
      if (!serviceCredentials) {
        return { isValid: false, credentials: { username } }
      }

      const matchingCredential = serviceCredentials.find(
        (cred) => cred.username === username && cred.password === password
      )

      return { isValid: !!matchingCredential, credentials: { username } }
    }
  })

  server.auth.default('service-token')

  // Register routes
  await server.register(router)

  // Register remaining plugins
  await server.register([
    requestLogger,
    requestTracing,
    secureContext,
    pulse,
    mongoDb
  ])

  return server
}

export { createServer }
