import { ValidationError } from './errors/validation-error.js'

/**
 * Header the external API uses to forward the organisation that
 * waste-organisation-backend resolved for the request's apiCode. It is only
 * set when that lookup succeeded, so it is missing for an unknown or disabled
 * API code.
 */
export const ORGANISATION_ID_HEADER = 'x-dwt-organisation-id'

/**
 * Returns the organisation ID the external API forwarded for this request.
 * Rejects a request without one with the same error an invalid API code has
 * always produced.
 * @param {Object} request - Hapi request (header names are lower-cased)
 * @returns {string} the organisation ID
 */
export function getOrganisationId(request) {
  const organisationId = request?.headers?.[ORGANISATION_ID_HEADER]

  if (typeof organisationId !== 'string' || organisationId.trim() === '') {
    throw new ValidationError(
      'apiCode',
      'the API Code supplied is invalid',
      'InvalidValue'
    )
  }

  return organisationId
}
