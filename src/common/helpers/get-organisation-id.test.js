import {
  ORGANISATION_ID_HEADER,
  getOrganisationIdFromHeaders
} from './get-organisation-id.js'
import { ValidationError } from './errors/validation-error.js'

describe('getOrganisationIdFromHeaders', () => {
  const organisationId = 'd829f66d-857f-401d-b5e9-5061b7dbb29d'

  it('returns the organisation forwarded by the external API', () => {
    expect(
      getOrganisationIdFromHeaders({ [ORGANISATION_ID_HEADER]: organisationId })
    ).toEqual(organisationId)
  })

  it.each([
    ['no headers', undefined],
    ['no organisation header', {}],
    ['an empty organisation header', { [ORGANISATION_ID_HEADER]: '' }],
    ['a blank organisation header', { [ORGANISATION_ID_HEADER]: '  ' }]
  ])('rejects %s as an invalid API code', (_description, headers) => {
    let error
    try {
      getOrganisationIdFromHeaders(headers)
    } catch (e) {
      error = e
    }

    expect(error).toBeInstanceOf(ValidationError)
    expect(error).toMatchObject({
      key: 'apiCode',
      message: 'the API Code supplied is invalid',
      errorType: 'InvalidValue'
    })
  })
})
