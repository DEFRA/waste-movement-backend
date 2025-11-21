import { ValidationError } from '../helpers/errors/validation-error.js'

export function getOrgIdForApiCode(apiCode, orgApiCodes) {
  const orgId = (orgApiCodes || []).find(
    (orgApiCode) => orgApiCode.apiCode === apiCode
  )?.orgId

  if (!orgId) {
    throw new ValidationError('apiCode', 'the API Code supplied is invalid')
  }

  return orgId
}
