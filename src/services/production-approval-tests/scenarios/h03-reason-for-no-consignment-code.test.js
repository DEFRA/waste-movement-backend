import { runScenarioH03Tests } from './h03-reason-for-no-consignment-code.js'
import { buildWasteInput } from '../test-helpers.js'
import { PAT_STATUS } from '../status.js'

describe('runScenarioH03Tests', () => {
  it('passes when reasonForNoConsignmentCode is provided', () => {
    const result = runScenarioH03Tests(
      buildWasteInput({
        reasonForNoConsignmentCode: 'Carrier did not provide consignment code'
      })
    )

    expect(result).toEqual({ status: PAT_STATUS.PASS, message: '' })
  })

  it('fails when reasonForNoConsignmentCode is missing', () => {
    const result = runScenarioH03Tests(buildWasteInput())

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected reasonForNoConsignmentCode to be given for H03'
    )
  })

  it('fails when reasonForNoConsignmentCode is an empty string', () => {
    const result = runScenarioH03Tests(
      buildWasteInput({ reasonForNoConsignmentCode: '' })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected reasonForNoConsignmentCode to be given for H03'
    )
  })

  it('fails when movement is missing', () => {
    const result = runScenarioH03Tests({ receipt: {} })

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected reasonForNoConsignmentCode to be given for H03'
    )
  })
})
