import { runScenarioH01Tests } from './h01-multiple-hazardous-components.js'
import { buildWasteInput, buildWasteItem } from '../test-helpers.js'
import { PAT_STATUS } from '../status.js'

describe('runScenarioH01Tests', () => {
  it('passes when all waste items have multiple hazardous components', () => {
    const result = runScenarioH01Tests(
      buildWasteInput({
        wasteItems: [buildWasteItem({ hazardous: { components: [{}, {}] } })]
      })
    )

    expect(result).toEqual({ status: PAT_STATUS.PASS, message: '' })
  })

  it('passes when some waste items have multiple hazardous components', () => {
    const result = runScenarioH01Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem(),
          buildWasteItem({ hazardous: {} }),
          buildWasteItem({ hazardous: { components: [{}] } }),
          buildWasteItem({ hazardous: { components: [{}, {}] } })
        ]
      })
    )

    expect(result).toEqual({ status: PAT_STATUS.PASS, message: '' })
  })

  it('fails when no waste items have multiple hazardous components', () => {
    const result = runScenarioH01Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem({ hazardous: { components: [{}] } }),
          buildWasteItem({ hazardous: { components: [{}] } })
        ]
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected one or more waste items to have multiple hazardous components'
    )
  })

  it('fails when wasteItems is empty', () => {
    const result = runScenarioH01Tests(buildWasteInput({ wasteItems: [] }))

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected one or more waste items to have multiple hazardous components'
    )
  })

  it('fails when wasteItems is missing', () => {
    const result = runScenarioH01Tests({ receipt: { movement: {} } })

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected one or more waste items to have multiple hazardous components'
    )
  })
})
