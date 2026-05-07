import { runScenarioR01Tests } from './r01-single-waste-item.js'
import { buildWasteInput, buildWasteItem } from './test-helpers.js'
import { PAT_STATUS } from './status.js'

describe('runScenarioR01Tests', () => {
  it('passes with 1 waste item that has a disposal or recovery code, no POPs and no hazardous', () => {
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

  it('fails when wasteItems is missing', () => {
    const result = runScenarioR01Tests({ receipt: { movement: {} } })

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected exactly 1 waste item for R01, found 0'
    )
  })

  it('fails when the waste item has no disposal or recovery codes', () => {
    const result = runScenarioR01Tests(
      buildWasteInput({
        wasteItems: [buildWasteItem({ disposalOrRecoveryCodes: [] })]
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected the waste item to have at least one disposal or recovery code for R01'
    )
  })

  it('fails when the waste item contains POPs', () => {
    const result = runScenarioR01Tests(
      buildWasteInput({
        wasteItems: [buildWasteItem({ containsPops: true })]
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected the waste item to not contain POPs for R01'
    )
  })

  it('fails when the waste item contains hazardous components', () => {
    const result = runScenarioR01Tests(
      buildWasteInput({
        wasteItems: [buildWasteItem({ containsHazardous: true })]
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected the waste item to not contain hazardous components for R01'
    )
  })
})
