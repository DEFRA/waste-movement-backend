import { getOrgIdForApiCode } from './validate-api-code.js'
import { ValidationError } from './errors/validation-error.js'
import { config } from '../../config.js'

export function getOrganisationValidationError(item, existing) {
  if (item.submittingOrganisation) {
    if (
      item.submittingOrganisation.defraCustomerOrganisationId !==
      existing.submittingOrganisation?.defraCustomerOrganisationId
    ) {
      return new ValidationError(
        'submittingOrganisation',
        'the submitting organisation does not match the Organisation that created the original waste item record',
        'BusinessRuleViolation'
      )
    }
    return null
  }

  const requestOrgId = getOrgIdForApiCode(
    item.apiCode,
    config.get('orgApiCodes')
  )
  if (existing.orgId !== requestOrgId) {
    return new ValidationError(
      'apiCode',
      'the API Code supplied does not relate to the same Organisation as created the original waste item record',
      'BusinessRuleViolation'
    )
  }
  return null
}
