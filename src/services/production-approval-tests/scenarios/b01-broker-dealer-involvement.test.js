import { runScenarioB01Tests } from './b01-broker-dealer-involvement.js'
import { buildWasteInput } from '../test-helpers.js'
import { PAT_STATUS } from '../status.js'

describe('runScenarioB01Tests', () => {
  it('passes when brokerOrDealer is provided with an organisationName', () => {
    const result = runScenarioB01Tests(
      buildWasteInput({
        brokerOrDealer: { organisationName: 'Test Broker' }
      })
    )

    expect(result).toEqual({ status: PAT_STATUS.PASS, message: '' })
  })

  it('fails when brokerOrDealer is missing', () => {
    const result = runScenarioB01Tests(buildWasteInput())

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'No broker or dealer involvement in the movement'
    )
  })

  it('fails when brokerOrDealer is provided without an organisationName', () => {
    const result = runScenarioB01Tests(buildWasteInput({ brokerOrDealer: {} }))

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'No broker or dealer involvement in the movement'
    )
  })

  it('fails when movement is missing', () => {
    const result = runScenarioB01Tests({ receipt: {} })

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'No broker or dealer involvement in the movement'
    )
  })
})
