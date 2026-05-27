import { orgId1, orgId2 } from '../../../test/data/apiCodes.js'
import { convictValidateExcludeSubmittingOrganisations } from './validate-exclude-submitting-organisations.js'

describe('#convictValidateExcludeSubmittingOrganisations', () => {
  it('should not throw an error when given an empty array', () => {
    expect(() =>
      convictValidateExcludeSubmittingOrganisations.validate([])
    ).not.toThrow()
  })

  it('should not throw an error when given organisation ids in the correct format', () => {
    expect(() =>
      convictValidateExcludeSubmittingOrganisations.validate([orgId1, orgId2])
    ).not.toThrow()
  })

  it('should throw an error when given organisation ids in an incorrect format', () => {
    expect(() =>
      convictValidateExcludeSubmittingOrganisations.validate(['not-a-uuid'])
    ).toThrow()
  })

  it('should format a comma-separated string of organisation ids correctly', () => {
    expect(
      convictValidateExcludeSubmittingOrganisations.coerce(
        ` ${orgId1}, ${orgId2}, `
      )
    ).toEqual([orgId1, orgId2])
  })

  it('should format the default value to an empty array if no env variable specified', () => {
    expect(convictValidateExcludeSubmittingOrganisations.coerce('')).toEqual([])
  })
})
