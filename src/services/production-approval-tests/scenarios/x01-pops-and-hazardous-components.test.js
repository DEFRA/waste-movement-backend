import { runScenarioX01Tests } from './x01-pops-and-hazardous-components.js'
import { buildWasteInput, buildWasteItem } from '../test-helpers.js'
import { PAT_STATUS } from '../status.js'

describe('runScenarioX01Tests', () => {
  it('passes when all waste items have POPs and Hazardous components', () => {
    const result = runScenarioX01Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem({
            pops: { components: [{}] },
            hazardous: { components: [{}] }
          })
        ]
      })
    )

    expect(result).toEqual({ status: PAT_STATUS.PASS, message: '' })
  })

  it('passes when some waste items have POPs and Hazardous components', () => {
    const result = runScenarioX01Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem(),
          buildWasteItem({ pops: {} }),
          buildWasteItem({ hazardous: {} }),
          buildWasteItem({
            pops: { components: [{}] },
            hazardous: { components: [{}] }
          })
        ]
      })
    )

    expect(result).toEqual({ status: PAT_STATUS.PASS, message: '' })
  })

  it('fails when no waste items have POPs components', () => {
    const result = runScenarioX01Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem({
            pops: {},
            hazardous: { components: [{}] }
          })
        ]
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected one or more waste items to have POPs and Hazardous components'
    )
  })

  it('fails when no waste items have Hazardous components', () => {
    const result = runScenarioX01Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem({
            pops: { components: [{}] },
            hazardous: {}
          })
        ]
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected one or more waste items to have POPs and Hazardous components'
    )
  })

  it('fails when no waste items have POPs or Hazardous components (missing components property)', () => {
    const result = runScenarioX01Tests(
      buildWasteInput({
        wasteItems: [buildWasteItem({ pops: {}, hazardous: {} })]
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected one or more waste items to have POPs and Hazardous components'
    )
  })

  it('fails when no waste items have POPs or Hazardous components (empty components array)', () => {
    const result = runScenarioX01Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem({
            pops: { components: [] },
            hazardous: { components: [] }
          })
        ]
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected one or more waste items to have POPs and Hazardous components'
    )
  })

  it('fails when wasteItems is empty', () => {
    const result = runScenarioX01Tests(buildWasteInput({ wasteItems: [] }))

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected one or more waste items to have POPs and Hazardous components'
    )
  })

  it('fails when wasteItems is missing', () => {
    const result = runScenarioX01Tests({ receipt: { movement: {} } })

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected one or more waste items to have POPs and Hazardous components'
    )
  })
})
