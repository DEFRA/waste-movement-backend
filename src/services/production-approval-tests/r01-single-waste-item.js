import { fail, pass } from './status.js'

export function runScenarioR01Tests(wasteInput) {
  const wasteItems = wasteInput?.receipt?.movement?.wasteItems ?? []

  if (wasteItems.length === 0) {
    return fail('No waste items provided')
  }

  if (wasteItems.length > 1) {
    return fail('Multiple waste items provided')
  }

  const [wasteItem] = wasteItems

  if (!(wasteItem?.disposalOrRecoveryCodes?.length > 0)) {
    return fail('No disposal or recovery code provided')
  }

  if (wasteItem.containsPops === true) {
    return fail('POPs components provided')
  }

  if (wasteItem.containsHazardous === true) {
    return fail('Hazardous waste items provided')
  }

  return pass()
}
