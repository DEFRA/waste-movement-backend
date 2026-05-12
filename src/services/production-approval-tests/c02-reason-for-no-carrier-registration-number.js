import { fail, pass } from './status.js'

export function runScenarioC02Tests(wasteInput) {
  const reasonForNoRegistrationNumber =
    wasteInput?.receipt?.movement?.carrier?.reasonForNoRegistrationNumber

  if (!reasonForNoRegistrationNumber) {
    return fail(
      'Expected carrier.reasonForNoRegistrationNumber to be given for C02'
    )
  }

  return pass()
}
