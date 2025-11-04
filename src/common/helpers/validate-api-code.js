import { ValidationError } from '../helpers/errors/validation-error.js'

export function validateRequestApiCode(requestApiCode, orgApiCodes) {
  const requestOrgid = getOrganisationIdForApiCode(orgApiCodes, requestApiCode)

  if (!requestOrgid) {
    throw new ValidationError('apiCode must be valid')
  }

  return requestOrgid
}

function getOrganisationIdForApiCode(orgApiCodes, apiCode) {
  return (orgApiCodes || []).find(
    (orgApiCode) => orgApiCode.apiCode === apiCode
  )?.orgId
}
