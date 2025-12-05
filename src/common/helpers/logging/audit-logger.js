import { audit } from '@defra/cdp-auditing'
import { createLogger } from './logger.js'
import { AUDIT_LOGGER_TYPE } from '../../constants/audit-logger.js'

const logger = createLogger()

/**
 * Logs a message to the CDP audit endpoint
 * @param params - The params to use to call the audit endpoint
 * @param params.type - The audit log type, see AUDIT_LOGGER_TYPE
 * @param params.traceId - The audit log trace id, for example request.getTraceId()
 * @param params.version - The version of the audit logger that is being used
 * @param params.data - An object containing the audit log data
 * @param params.shouldThrowError - Determines if an error should be thrown
 * @returns {Boolean} True if the audit endpoint has been called successfully
 */
export function auditLogger({
  type,
  traceId,
  version = 1,
  data,
  shouldThrowError = false
}) {
  const auditTypes = Object.values(AUDIT_LOGGER_TYPE)

  try {
    if (!auditTypes.includes(type)) {
      throw new Error(`Audit type must be one of: ${auditTypes.join(', ')}`)
    }

    if (typeof data !== 'object') {
      throw new Error('Audit data must be provided as an object')
    }

    audit({ type, traceId, version, data })

    return true
  } catch (error) {
    logger.error(
      { type, traceId, version },
      `Failed to call audit endpoint: ${error.message}`
    )

    if (shouldThrowError) {
      throw new Error(`Failed to call audit endpoint: ${error.message}`)
    }
  }

  return false
}
