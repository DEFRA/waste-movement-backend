import { resolveOrgIdForApiCode } from '../../services/organisation.js'
import { ValidationError } from './errors/validation-error.js'

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

  const requestOrgId = resolveOrgIdForApiCode(item.apiCode)
  if (existing.orgId !== requestOrgId) {
    return new ValidationError(
      'apiCode',
      'the API Code supplied does not relate to the same Organisation as created the original waste item record',
      'BusinessRuleViolation'
    )
  }
  return null
}
