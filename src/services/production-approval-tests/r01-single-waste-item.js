import { fail, pass } from './status.js'

export function runScenarioR01Tests(wasteInput) {
  const wasteItems = wasteInput?.receipt?.movement?.wasteItems ?? []

  if (wasteItems.length !== 1) {
    return fail(
      `Expected exactly 1 waste item for R01, found ${wasteItems.length}`
    )
  }

  const [wasteItem] = wasteItems

  if (!(wasteItem?.disposalOrRecoveryCodes?.length > 0)) {
    return fail(
      'Expected the waste item to have at least one disposal or recovery code for R01'
    )
  }

  if (wasteItem.containsPops !== false) {
    return fail('Expected the waste item to not contain POPs for R01')
  }

  if (wasteItem.containsHazardous !== false) {
    return fail(
      'Expected the waste item to not contain hazardous components for R01'
    )
  }

  return pass()
}
