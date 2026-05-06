import { runScenarioR03Tests } from './r03-road-transport.js'
import { buildWasteInput } from './test-helpers.js'
import { PAT_STATUS } from './status.js'

describe('runScenarioR03Tests', () => {
  it('passes when carrier is by Road with a vehicle registration', () => {
    const result = runScenarioR03Tests(
      buildWasteInput({
        carrier: { meansOfTransport: 'Road', vehicleRegistration: 'AB12 CDE' }
      })
    )

    expect(result).toEqual({ status: PAT_STATUS.PASS, message: '' })
  })

  it('fails when meansOfTransport is not Road', () => {
    const result = runScenarioR03Tests(
      buildWasteInput({
        carrier: { meansOfTransport: 'Rail', vehicleRegistration: 'AB12 CDE' }
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected carrier.meansOfTransport to be "Road" for R03, found "Rail"'
    )
  })

  it('fails when carrier is missing', () => {
    const result = runScenarioR03Tests({ receipt: { movement: {} } })

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected carrier.meansOfTransport to be "Road" for R03, found "undefined"'
    )
  })

  it('fails when Road transport has no vehicle registration', () => {
    const result = runScenarioR03Tests(
      buildWasteInput({ carrier: { meansOfTransport: 'Road' } })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected carrier.vehicleRegistration to be provided for R03 road transport'
    )
  })
})
