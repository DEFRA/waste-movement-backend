import Hapi from '@hapi/hapi'
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
import { errorHandler } from './plugins/error-handler.js'
import { basicAuth, getEnvVars } from 'waste-movement-utils'

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

  await server.register([Inert, Vision])
  await server.register(swagger)
  await server.register(router)
  await server.register([
    requestLogger,
    requestTracing,
    secureContext,
    pulse,
    mongoDb,
    basicAuth(getEnvVars('ACCESS_CRED_')),
    errorHandler
  ])

  server.auth.default('basic')

  return server
}

export { createServer }
