import { config } from '../config.js'
import { getOrgIdForApiCode } from '../common/helpers/validate-api-code.js'

/**
 * Resolves the `orgId` for a submission that identifies its organisation via
 * a legacy `apiCode`, by looking it up in the `ORG_API_CODES` secret.
 *
 * @param {string} apiCode
 * @returns {string} the resolved orgId
 * @throws {import('../common/helpers/errors/validation-error.js').ValidationError} when apiCode does not match a known organisation
 */
export function resolveOrgIdForApiCode(apiCode) {
  return getOrgIdForApiCode(apiCode, config.get('orgApiCodes'))
}
