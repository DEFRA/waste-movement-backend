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

  it('fails with "No waste items provided" when wasteItems is empty', () => {
    const result = runScenarioR01Tests(buildWasteInput({ wasteItems: [] }))

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe('No waste items provided')
  })

  it('fails with "No waste items provided" when wasteItems is missing', () => {
    const result = runScenarioR01Tests({ receipt: { movement: {} } })

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe('No waste items provided')
  })

  it('fails with "Multiple waste items provided" when there are multiple waste items', () => {
    const result = runScenarioR01Tests(
      buildWasteInput({ wasteItems: [buildWasteItem(), buildWasteItem()] })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe('Multiple waste items provided')
  })

  it('fails when the waste item has no disposal or recovery codes', () => {
    const result = runScenarioR01Tests(
      buildWasteInput({
        wasteItems: [buildWasteItem({ disposalOrRecoveryCodes: [] })]
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe('No disposal or recovery code provided')
  })

  it('fails with "POPs components provided" when the waste item contains POPs', () => {
    const result = runScenarioR01Tests(
      buildWasteInput({
        wasteItems: [buildWasteItem({ containsPops: true })]
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe('POPs components provided')
  })

  it('fails with "Hazardous waste items provided" when the waste item contains hazardous components', () => {
    const result = runScenarioR01Tests(
      buildWasteInput({
        wasteItems: [buildWasteItem({ containsHazardous: true })]
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe('Hazardous waste items provided')
  })
})
