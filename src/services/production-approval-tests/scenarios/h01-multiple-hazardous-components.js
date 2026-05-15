import { fail, pass } from '../status.js'

export function runScenarioH01Tests(wasteInput) {
  const wasteItems = wasteInput?.receipt?.movement?.wasteItems ?? []

  const haveSomeWasteItemsGotMultipleHazardousComponents = wasteItems.some(
    (item) => item?.hazardous?.components?.length > 1
  )

  if (!haveSomeWasteItemsGotMultipleHazardousComponents) {
    return fail(
      'Expected one or more waste items to have multiple hazardous components'
    )
  }

  return pass()
}
