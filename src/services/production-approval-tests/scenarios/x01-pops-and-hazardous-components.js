import { fail, pass } from '../status.js'

export function runScenarioX01Tests(wasteInput) {
  const wasteItems = wasteInput?.receipt?.movement?.wasteItems ?? []

  const haveSomeWasteItemsGotPopsAndHazardousComponents = wasteItems.some(
    (item) =>
      item?.pops?.components?.length > 0 &&
      item?.hazardous?.components?.length > 0
  )

  if (!haveSomeWasteItemsGotPopsAndHazardousComponents) {
    return fail(
      'Expected one or more waste items to have POPs and Hazardous components'
    )
  }

  return pass()
}
