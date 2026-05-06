import { fail, pass } from './status.js'

const ROAD = 'Road'

export function runScenarioR03Tests(wasteInput) {
  const carrier = wasteInput?.receipt?.movement?.carrier

  if (carrier?.meansOfTransport !== ROAD) {
    return fail(
      `Expected carrier.meansOfTransport to be "${ROAD}" for R03, found "${carrier?.meansOfTransport ?? 'undefined'}"`
    )
  }

  if (!carrier.vehicleRegistration) {
    return fail(
      'Expected carrier.vehicleRegistration to be provided for R03 road transport'
    )
  }

  return pass()
}
