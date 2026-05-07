import { fail, pass } from './status.js'

const ROAD = 'Road'

export function runScenarioR03Tests(wasteInput) {
  const meansOfTransport =
    wasteInput?.receipt?.movement?.carrier?.meansOfTransport

  if (meansOfTransport !== ROAD) {
    return fail(
      `Expected carrier.meansOfTransport to be "${ROAD}" for R03, found "${meansOfTransport ?? 'undefined'}"`
    )
  }

  return pass()
}
