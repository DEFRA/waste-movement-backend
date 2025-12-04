import { audit } from '@defra/cdp-auditing'
import { createLogger } from './logger.js'
import { AUDIT_LOGGER_TYPE } from '../../constants/audit-logger.js'

const logger = createLogger()

/**
 * Logs a message to the CDP audit endpoint
 * @param params - The params to use to call the audit endpoint
 * @param params.type - The audit log type, see AUDIT_LOGGER_TYPE
 * @param params.traceId - The audit log correlation id, for example request.getTraceId
 * @param params.version - The version of the audit logger that is being used
 * @param params.data - An object containing the audit log data
 * @param params.fieldsToExcludeFromLoggedData - The fields that should be excluded from the data logged in an error message
 * @param params.shouldThrowError - Determines if an error should be thrown
 * @returns {Boolean} True if the audit endpoint has been called successfully
 */
export function auditLogger({
  type,
  traceId,
  version = 1,
  data,
  fieldsToExcludeFromLoggedData,
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
    if (Array.isArray(fieldsToExcludeFromLoggedData)) {
      fieldsToExcludeFromLoggedData.forEach((field) => delete data[field])
    }

    logger.error(data, `Failed to call audit endpoint: ${error.message}`)

    if (shouldThrowError) {
      throw new Error(`Failed to call audit endpoint: ${error.message}`)
    }
  }

  return false
}
