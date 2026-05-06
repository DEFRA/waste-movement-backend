import { fail, pass } from './status.js'

export function runScenarioR01Tests(wasteInput) {
  const wasteItems = wasteInput?.receipt?.movement?.wasteItems ?? []

  if (wasteItems.length !== 1) {
    return fail(
      `Expected exactly 1 waste item for R01, found ${wasteItems.length}`
    )
  }

  return pass()
}
