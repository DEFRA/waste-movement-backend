import { fail, pass } from './status.js'

export function runScenarioR04Tests(wasteInput) {
  const wasteItems = wasteInput?.receipt?.movement?.wasteItems ?? []

  const offendingIndexes = wasteItems
    .map((item, index) =>
      item?.disposalOrRecoveryCodes?.length > 0 ? index : null
    )
    .filter((index) => index !== null)

  if (offendingIndexes.length > 0) {
    return fail(
      `Expected no disposal or recovery codes for R04, found codes on waste item(s) at index ${offendingIndexes.join(', ')}`
    )
  }

  return pass()
}
