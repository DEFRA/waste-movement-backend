import { fail, pass } from './status.js'

const DUAL_EWC_CODE_COUNT = 2

export function runScenarioR07Tests(wasteInput) {
  const wasteItems = wasteInput?.receipt?.movement?.wasteItems ?? []

  const hasDualEwcCodes = wasteItems.some(
    (item) => item?.ewcCodes?.length === DUAL_EWC_CODE_COUNT
  )

  if (!hasDualEwcCodes) {
    return fail('Expected at least one waste item to have 2 EWC codes for R07')
  }

  return pass()
}
