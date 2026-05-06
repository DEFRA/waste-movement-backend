import { runScenarioR05Tests } from './r05-multiple-disposal-or-recovery-codes.js'
import { buildWasteInput, buildWasteItem } from './test-helpers.js'
import { PAT_STATUS } from './status.js'

describe('runScenarioR05Tests', () => {
  it('passes when a waste item has multiple disposal or recovery codes', () => {
    const result = runScenarioR05Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem({
            disposalOrRecoveryCodes: [{ code: 'R1' }, { code: 'D1' }]
          })
        ]
      })
    )

    expect(result).toEqual({ status: PAT_STATUS.PASS, message: '' })
  })

  it('passes when one of several waste items has multiple codes', () => {
    const result = runScenarioR05Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem({ disposalOrRecoveryCodes: [{ code: 'R1' }] }),
          buildWasteItem({
            disposalOrRecoveryCodes: [{ code: 'R1' }, { code: 'D5' }]
          })
        ]
      })
    )

    expect(result.status).toBe(PAT_STATUS.PASS)
  })

  it('fails when no waste item has multiple disposal or recovery codes', () => {
    const result = runScenarioR05Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem({ disposalOrRecoveryCodes: [{ code: 'R1' }] }),
          buildWasteItem({ disposalOrRecoveryCodes: [{ code: 'R1' }] })
        ]
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected at least one waste item to have multiple disposal or recovery codes for R05'
    )
  })

  it('fails when wasteItems is empty', () => {
    const result = runScenarioR05Tests(buildWasteInput({ wasteItems: [] }))

    expect(result.status).toBe(PAT_STATUS.FAIL)
  })
})
