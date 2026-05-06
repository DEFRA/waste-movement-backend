import { runScenarioR07Tests } from './r07-dual-ewc-codes.js'
import { buildWasteInput, buildWasteItem } from './test-helpers.js'
import { PAT_STATUS } from './status.js'

describe('runScenarioR07Tests', () => {
  it('passes when a waste item has 2 EWC codes', () => {
    const result = runScenarioR07Tests(
      buildWasteInput({
        wasteItems: [buildWasteItem({ ewcCodes: ['200101', '200102'] })]
      })
    )

    expect(result).toEqual({ status: PAT_STATUS.PASS, message: '' })
  })

  it('passes when at least one waste item has 2 EWC codes', () => {
    const result = runScenarioR07Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem({ ewcCodes: ['200101'] }),
          buildWasteItem({ ewcCodes: ['200101', '200102'] })
        ]
      })
    )

    expect(result.status).toBe(PAT_STATUS.PASS)
  })

  it('fails when no waste item has exactly 2 EWC codes', () => {
    const result = runScenarioR07Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem({ ewcCodes: ['200101'] }),
          buildWasteItem({ ewcCodes: ['200101', '200102', '200103'] })
        ]
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected at least one waste item to have 2 EWC codes for R07'
    )
  })

  it('fails when wasteItems is empty', () => {
    const result = runScenarioR07Tests(buildWasteInput({ wasteItems: [] }))

    expect(result.status).toBe(PAT_STATUS.FAIL)
  })
})
