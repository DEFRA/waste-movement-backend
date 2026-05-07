import { runScenarioR02Tests } from './r02-multiple-waste-items.js'
import { buildWasteInput, buildWasteItem } from './test-helpers.js'
import { PAT_STATUS } from './status.js'

describe('runScenarioR02Tests', () => {
  it('passes when there are 2 waste items', () => {
    const result = runScenarioR02Tests(
      buildWasteInput({ wasteItems: [buildWasteItem(), buildWasteItem()] })
    )

    expect(result).toEqual({ status: PAT_STATUS.PASS, message: '' })
  })

  it('passes when there are 3 waste items', () => {
    const result = runScenarioR02Tests(
      buildWasteInput({
        wasteItems: [buildWasteItem(), buildWasteItem(), buildWasteItem()]
      })
    )

    expect(result.status).toBe(PAT_STATUS.PASS)
  })

  it('fails when there is exactly 1 waste item', () => {
    const result = runScenarioR02Tests(
      buildWasteInput({ wasteItems: [buildWasteItem()] })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected more than 1 waste item for R02, found 1'
    )
  })

  it('fails when wasteItems is missing', () => {
    const result = runScenarioR02Tests({ receipt: { movement: {} } })

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected more than 1 waste item for R02, found 0'
    )
  })
})
