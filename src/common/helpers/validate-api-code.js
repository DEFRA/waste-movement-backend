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

export async function validateRequestOrgIdMatchesOriginalOrgId(
  requestApiCode,
  requestWasteTrackingId,
  db,
  orgApiCodes
) {
  const requestOrgId = getOrgIdForApiCode(requestApiCode, orgApiCodes)

  // If this is the first update then there won't be a history entry
  let result = await db
    .collection('waste-inputs')
    .findOne({ wasteTrackingId: requestWasteTrackingId, revision: 1 })

  if (!result) {
    // If there have been previous updates then there will be a history entry
    result = await db
      .collection('waste-inputs-history')
      .findOne({ wasteTrackingId: requestWasteTrackingId, revision: 1 })
  }

  // Run check if entry was found, if not then don't need to throw an error as
  // the update process handles it
  if (result && requestOrgId !== result.orgId) {
    throw new ValidationError(
      'apiCode',
      'the API Code supplied does not relate to the same Organisation as created the original waste item record'
    )
  }

  return true
}
