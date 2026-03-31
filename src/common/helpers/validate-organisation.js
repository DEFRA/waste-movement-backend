import { ValidationError } from './errors/validation-error.js'

export function getOrganisationValidationError(item, existing) {
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
