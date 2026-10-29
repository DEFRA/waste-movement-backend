import { ecsFormat } from '@elastic/ecs-pino-format'
import { config } from '../../../config.js'
import { getTraceId } from '@defra/hapi-tracing'
import {
  getClientId,
  getClientName,
  getOrganisationId,
  getOrganisationName
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
    const traceId = getTraceId()
    const organisationId = getOrganisationId()
    const organisationName = getOrganisationName()
    const clientId = getClientId()
    const clientName = getClientName()

    return {
      ...(traceId && {
        trace: { id: traceId }
      }),
      ...(organisationId && {
        event: {
          reference: organisationId,
          ...(organisationName && { reason: organisationName })
        }
      }),
      ...((clientId || clientName) && {
        tenant: {
          ...(clientId && { id: clientId }),
          ...(clientName && { message: clientName })
        }
      })
    }
  },
  // Pino merges the mixin one level deep by default, so a line logging its own
  // event (e.g. event.action) would drop the mixin's event.reference. Merge
  // the nested objects instead; the line's own values still win.
  mixinMergeStrategy(mergeObject, mixinObject) {
    const merged = { ...mixinObject, ...mergeObject }

    for (const [key, value] of Object.entries(mixinObject)) {
      if (isPlainObject(value) && isPlainObject(mergeObject[key])) {
        merged[key] = { ...value, ...mergeObject[key] }
      }
    }

    return merged
  }
}

function isPlainObject(value) {
  return value?.constructor === Object
}
