import { fail, pass } from '../status.js'

const MIN_DUAL_EWC_CODES = 2

export function runScenarioR07Tests(wasteInput) {
  const wasteItems = wasteInput?.receipt?.movement?.wasteItems ?? []

  const hasDualEwcCodes = wasteItems.some(
    (item) => item?.ewcCodes?.length >= MIN_DUAL_EWC_CODES
  )

  if (!hasDualEwcCodes) {
    return fail(
      'Expected at least one waste item to have at least 2 EWC codes for R07'
    )
  }

  return pass()
}
