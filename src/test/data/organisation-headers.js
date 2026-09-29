import { ORGANISATION_ID_HEADER } from '../../common/helpers/get-organisation-id.js'

// The organisation the external API forwards for a valid API code. It is
// deliberately not an orgId in ORG_API_CODES (see apiCodes.js), so tests can
// tell which source a saved orgId came from.
export const forwardedOrganisationId = 'd829f66d-857f-401d-b5e9-5061b7dbb29d'

export const organisationHeaders = {
  [ORGANISATION_ID_HEADER]: forwardedOrganisationId
}
