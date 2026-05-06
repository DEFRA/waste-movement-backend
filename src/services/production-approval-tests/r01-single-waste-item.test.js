import { runScenarioR01Tests } from './r01-single-waste-item.js'
import { buildWasteInput, buildWasteItem } from './test-helpers.js'
import { PAT_STATUS } from './status.js'

describe('runScenarioR01Tests', () => {
  it('passes when there is exactly 1 waste item', () => {
    const result = runScenarioR01Tests(
      buildWasteInput({ wasteItems: [buildWasteItem()] })
    )

    expect(result).toEqual({ status: PAT_STATUS.PASS, message: '' })
  })

  it('fails when there are 0 waste items', () => {
    const result = runScenarioR01Tests(buildWasteInput({ wasteItems: [] }))

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected exactly 1 waste item for R01, found 0'
    )
  })

  it('fails when there are multiple waste items', () => {
    const result = runScenarioR01Tests(
      buildWasteInput({ wasteItems: [buildWasteItem(), buildWasteItem()] })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected exactly 1 waste item for R01, found 2'
    )
  })

  it('fails gracefully when wasteInput is missing waste items', () => {
    const result = runScenarioR01Tests({ receipt: { movement: {} } })

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected exactly 1 waste item for R01, found 0'
    )
  })
})
