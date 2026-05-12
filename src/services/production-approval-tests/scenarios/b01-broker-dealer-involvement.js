import { fail, pass } from '../status.js'

export function runScenarioB01Tests(wasteInput) {
  const brokerOrDealer = wasteInput?.receipt?.movement?.brokerOrDealer

  if (!brokerOrDealer?.organisationName) {
    return fail('No broker or dealer involvement in the movement')
  }

  return pass()
}
