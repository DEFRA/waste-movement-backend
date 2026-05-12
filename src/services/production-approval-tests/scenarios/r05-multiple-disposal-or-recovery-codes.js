import { fail, pass } from '../status.js'

export function runScenarioR05Tests(wasteInput) {
  const wasteItems = wasteInput?.receipt?.movement?.wasteItems ?? []

  const hasMultipleCodes = wasteItems.some(
    (item) => item?.disposalOrRecoveryCodes?.length > 1
  )

  if (!hasMultipleCodes) {
    return fail(
      'Expected at least one waste item to have multiple disposal or recovery codes for R05'
    )
  }

  return pass()
}
