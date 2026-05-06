import { runScenarioR04Tests } from './r04-no-disposal-or-recovery-codes.js'
import { buildWasteInput, buildWasteItem } from './test-helpers.js'
import { PAT_STATUS } from './status.js'

describe('runScenarioR04Tests', () => {
  it('passes when no waste items have disposal or recovery codes', () => {
    const result = runScenarioR04Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem({ disposalOrRecoveryCodes: [] }),
          buildWasteItem({ disposalOrRecoveryCodes: undefined })
        ]
      })
    )

    expect(result).toEqual({ status: PAT_STATUS.PASS, message: '' })
  })

  it('passes when wasteItems is empty', () => {
    const result = runScenarioR04Tests(buildWasteInput({ wasteItems: [] }))

    expect(result.status).toBe(PAT_STATUS.PASS)
  })

  it('fails when a waste item has a disposal or recovery code', () => {
    const result = runScenarioR04Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem({ disposalOrRecoveryCodes: [] }),
          buildWasteItem({ disposalOrRecoveryCodes: [{ code: 'R1' }] })
        ]
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected no disposal or recovery codes for R04, found codes on waste item(s) at index 1'
    )
  })

  it('lists every offending waste item index', () => {
    const result = runScenarioR04Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem({ disposalOrRecoveryCodes: [{ code: 'R1' }] }),
          buildWasteItem({ disposalOrRecoveryCodes: [] }),
          buildWasteItem({ disposalOrRecoveryCodes: [{ code: 'D1' }] })
        ]
      })
    )

    expect(result.message).toBe(
      'Expected no disposal or recovery codes for R04, found codes on waste item(s) at index 0, 2'
    )
  })
})
