import convict from 'convict'
import convictFormatWithValidator from 'convict-format-with-validator'

import { convictValidateMongoUri } from './common/helpers/convict/validate-mongo-uri.js'
import { convictValidateOrgApiCodes } from './common/helpers/convict/validate-org-api-codes.js'

convict.addFormat(convictValidateMongoUri)
convict.addFormat(convictValidateOrgApiCodes)
convict.addFormats(convictFormatWithValidator)

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'

const config = convict({
  serviceVersion: {
    doc: 'The service version, this variable is injected into your docker container in CDP environments',
    format: String,
    nullable: true,
    default: null,
    env: 'SERVICE_VERSION'
  },
  host: {
    doc: 'The IP address to bind',
    format: 'ipaddress',
    default: '0.0.0.0',
    env: 'HOST'
  },
  port: {
    doc: 'The port to bind',
    format: 'port',
    default: 3001,
    env: 'PORT'
  },
  serviceName: {
    doc: 'Api Service Name',
    format: String,
    default: 'waste-movement-backend'
  },
  cdpEnvironment: {
    doc: 'The CDP environment the app is running in. With the addition of "local" for local development',
    format: [
      'local',
      'infra-dev',
      'management',
      'dev',
      'test',
      'perf-test',
      'ext-test',
      'prod'
    ],
    default: 'local',
    env: 'ENVIRONMENT'
  },
  log: {
    isEnabled: {
      doc: 'Is logging enabled',
      format: Boolean,
      default: !isTest,
      env: 'LOG_ENABLED'
    },
    level: {
      doc: 'Logging level',
      format: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
      default: 'info',
      env: 'LOG_LEVEL'
    },
    format: {
      doc: 'Format to output logs in',
      format: ['ecs', 'pino-pretty'],
      default: isProduction ? 'ecs' : 'pino-pretty',
      env: 'LOG_FORMAT'
    },
    redact: {
      doc: 'Log paths to redact',
      format: Array,
      default: isProduction
        ? ['req.headers.authorization', 'req.headers.cookie', 'res.headers']
        : ['req', 'res', 'responseTime']
    }
  },
  mongo: {
    uri: {
      doc: 'URI for mongodb',
      format: String,
      default: 'mongodb://127.0.0.1:27017',
      env: 'MONGO_URI'
    },
    databaseName: {
      doc: 'Database name for mongodb',
      format: String,
      default: 'waste-movement-backend',
      env: 'MONGO_DATABASE'
    },
    timeoutMs: {
      doc: 'Timeout in ms for mongodb',
      format: Number,
      default: 5000,
      env: 'MONGO_TIMEOUT_MS'
    },
    readPreference: {
      doc: 'Read preference for mongodb',
      format: String,
      default: 'secondary',
      env: 'MONGO_READ_PREFERENCE'
    }
  },
  httpProxy: {
    doc: 'HTTP Proxy URL',
    format: String,
    nullable: true,
    default: null,
    env: 'HTTP_PROXY'
  },
  isSecureContextEnabled: {
    doc: 'Enable Secure Context',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_SECURE_CONTEXT'
  },
  isMetricsEnabled: {
    doc: 'Enable metrics reporting',
    format: Boolean,
    default: isProduction,
    env: 'ENABLE_METRICS'
  },
  tracing: {
    header: {
      doc: 'CDP tracing header name',
      format: String,
      default: 'x-cdp-request-id',
      env: 'TRACING_HEADER'
    }
  },
  orgApiCodes: {
    doc: 'The Org API Codes given to external developers, this variable is stored as a comma separated, base64 encoded secret and is injected into the docker container in CDP environments',
    format: 'org-api-codes',
    default: btoa(
      '00000000-0000-0000-0000-000000000000=00000000-0000-0000-0000-000000000000'
    ),
    env: 'ORG_API_CODES'
  },
  services: {
    wasteTracking: {
      doc: 'Waste Tracking Service URL',
      format: String,
      default: 'https://waste-tracking-id-backend.dev.cdp-int.defra.cloud',
      env: 'WASTE_TRACKING_SERVICE_URL'
    },
    wasteTrackingBatchSize: {
      doc: 'Waste Tracking Service batch size',
      format: Number,
      default: 100,
      env: 'WASTE_TRACKING_SERVICE_BATCH_SIZE'
    }
  },
  serviceAuth: {
    username: {
      doc: 'Username for authenticating with internal backend services',
      format: String,
      default: 'waste-movement-backend',
      env: 'SERVICE_AUTH_USERNAME_WASTE_MOVEMENT_BACKEND'
    },
    password: {
      doc: 'Password for authenticating with internal backend services',
      format: String,
      default: '',
      env: 'SERVICE_AUTH_PASSWORD_WASTE_MOVEMENT_BACKEND'
    }
  }
})

const overrideConfig = {
  services: {
    wasteTracking: `https://waste-tracking-id-backend.${config.get('cdpEnvironment')}.cdp-int.defra.cloud`
  }
}

config.load(overrideConfig)

config.validate({ allowed: 'strict' })

export { config }
