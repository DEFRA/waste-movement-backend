import { fail, pass } from '../status.js'

export function runScenarioH03Tests(wasteInput) {
  const reasonForNoConsignmentCode =
    wasteInput?.receipt?.movement?.reasonForNoConsignmentCode

  if (!reasonForNoConsignmentCode) {
    return fail('Expected reasonForNoConsignmentCode to be given for H03')
  }

  return pass()
}
