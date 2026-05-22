import { audit } from '@defra/cdp-auditing'
import { createLogger } from './logger.js'
import { AUDIT_LOGGER_TYPE } from '../../constants/audit-logger.js'
import { metricsCounter } from '../metrics.js'
import { config } from '../../../config.js'

const logger = createLogger()

/**
 * Logs a message to the CDP audit endpoint
 * @param params - The params to use to call the audit endpoint
 * @param params.type - The audit log type, see AUDIT_LOGGER_TYPE
 * @param params.traceId - The audit log trace id, for example request.getTraceId()
 * @param params.version - The version of the audit logger that is being used
 * @param params.data - An object containing the audit log data
 * @param params.wasteTrackingId - The waste tracking id of the movement
 * @param params.revision - The revision number of the movement
 * @param params.shouldThrowError - Determines if an error should be thrown
 * @returns {Boolean} True if the audit endpoint has been called successfully
 */
export function auditLogger({
  type,
  traceId,
  version = 1,
  data,
  wasteTrackingId,
  revision,
  shouldThrowError = false
}) {
  const auditTypes = Object.values(AUDIT_LOGGER_TYPE)

  try {
    if (!auditTypes.includes(type)) {
      throw new Error(`Audit type must be one of: ${auditTypes.join(', ')}`)
    }

    if (typeof data !== 'object') {
      throw new TypeError('Audit data must be provided as an object')
    }

    const excludedSubmittingOrganisations = config.get(
      'excludedSubmittingOrganisations'
    )

    if (
      excludedSubmittingOrganisations.includes(
        data?.submittingOrganisation?.defraCustomerOrganisationId
      )
    ) {
      logger.info(
        {
          type,
          traceId,
          wasteTrackingId,
          revision
        },
        `Audit log NOT sent for movement: ${wasteTrackingId} revision: ${revision}`
      )

      return true
    }

    audit({ metadata: { type, traceId, version }, data })

    logger.info(
      {
        type,
        traceId,
        wasteTrackingId,
        revision
      },
      `Audit log sent for movement: ${wasteTrackingId} revision: ${revision}`
    )

    return true
  } catch (error) {
    const logErrorMessage = `Failed to call audit endpoint: ${error.message}`

    logger.error(
      {
        type,
        traceId,
        version,
        wasteTrackingId,
        revision
      },
      logErrorMessage
    )

    metricsCounter('audit.errors.failed', 1, { auditLogType: type, traceId })

    if (shouldThrowError) {
      throw new Error(logErrorMessage)
    }
  }

  return false
}
