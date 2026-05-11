import { runScenarioC02Tests } from './c02-reason-for-no-carrier-registration-number.js'
import { buildWasteInput } from './test-helpers.js'
import { PAT_STATUS } from './status.js'
import { REASONS_FOR_NO_REGISTRATION_NUMBER } from '../../common/constants/reasons-for-no-registration-number.js'

describe('runScenarioC02Tests', () => {
  it('passes when carrier reasonForNoRegistrationNumber is given', () => {
    const result = runScenarioC02Tests(
      buildWasteInput({
        carrier: {
          reasonForNoRegistrationNumber: REASONS_FOR_NO_REGISTRATION_NUMBER[0]
        }
      })
    )

    expect(result).toEqual({ status: PAT_STATUS.PASS, message: '' })
  })

  it('fails when reasonForNoRegistrationNumber is not given', () => {
    const result = runScenarioC02Tests(
      buildWasteInput({
        carrier: {}
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected carrier.reasonForNoRegistrationNumber to be given for C02'
    )
  })

  it('fails when carrier is missing', () => {
    const result = runScenarioC02Tests({ receipt: { movement: {} } })

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected carrier.reasonForNoRegistrationNumber to be given for C02'
    )
  })
})
