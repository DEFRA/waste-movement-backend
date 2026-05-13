import { fail, pass } from '../status.js'

export function runScenarioP01Tests(wasteInput) {
  const wasteItems = wasteInput?.receipt?.movement?.wasteItems ?? []

  const haveSomeWasteItemsGotMultiplePopsComponents = wasteItems.some(
    (item) => item?.pops?.components?.length > 1
  )

  if (!haveSomeWasteItemsGotMultiplePopsComponents) {
    return fail(
      'Expected one or more waste items to have multiple POPs components'
    )
  }

  return pass()
}
