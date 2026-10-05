import { ecsFormat } from '@elastic/ecs-pino-format'
import { config } from '../../../config.js'
import { getTraceId } from '@defra/hapi-tracing'
import {
  getClientId,
  getClientName,
  getOrganisationId
} from '../../../plugins/request-custom-logger.js'

const logConfig = config.get('log')
const serviceName = config.get('serviceName')
const serviceVersion = config.get('serviceVersion')

const formatters = {
  ecs: {
    ...ecsFormat({
      serviceVersion,
      serviceName
    })
  },
  'pino-pretty': { transport: { target: 'pino-pretty' } }
}

export const loggerOptions = {
  enabled: logConfig.isEnabled,
  ignorePaths: ['/health'],
  redact: {
    paths: logConfig.redact,
    remove: true
  },
  level: logConfig.level,
  ...formatters[logConfig.format],
  nesting: true,
  mixin() {
    const mixinValues = {}
    const traceId = getTraceId()
    const xDwtClientId = getClientId()
    const clientName = getClientName()
    const organisationId = getOrganisationId()
    if (traceId) {
      mixinValues.trace = { id: traceId }
    }
    if (xDwtClientId) {
      mixinValues.tenant = { id: xDwtClientId }
    }
    if (clientName) {
      mixinValues.tenant = { ...mixinValues.tenant, message: clientName }
    }
    if (organisationId) {
      mixinValues.event = { reference: organisationId }
    }

    return mixinValues
  }
}
