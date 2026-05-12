import { fail, pass } from '../status.js'

export function runScenarioR02Tests(wasteInput) {
  const wasteItems = wasteInput?.receipt?.movement?.wasteItems ?? []

  if (wasteItems.length < 2) {
    return fail(
      `Expected more than 1 waste item for R02, found ${wasteItems.length}`
    )
  }

  return pass()
}
