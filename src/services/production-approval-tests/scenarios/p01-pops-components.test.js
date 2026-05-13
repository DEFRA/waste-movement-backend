import { runScenarioP01Tests } from './p01-pops-components.js'
import { buildWasteInput, buildWasteItem } from '../test-helpers.js'
import { PAT_STATUS } from '../status.js'

describe('runScenarioP01Tests', () => {
  it('passes when all waste items have multiple POPs components', () => {
    const result = runScenarioP01Tests(
      buildWasteInput({
        wasteItems: [buildWasteItem({ pops: { components: [{}, {}] } })]
      })
    )

    expect(result).toEqual({ status: PAT_STATUS.PASS, message: '' })
  })

  it('passes when some waste items have multiple POPs components', () => {
    const result = runScenarioP01Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem(),
          buildWasteItem({ pops: {} }),
          buildWasteItem({ pops: { components: [{}] } }),
          buildWasteItem({ pops: { components: [{}, {}] } })
        ]
      })
    )

    expect(result).toEqual({ status: PAT_STATUS.PASS, message: '' })
  })

  it('fails when no waste items have multiple POPs components', () => {
    const result = runScenarioP01Tests(
      buildWasteInput({
        wasteItems: [
          buildWasteItem({ pops: { components: [{}] } }),
          buildWasteItem({ pops: { components: [{}] } })
        ]
      })
    )

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected one or more waste items to have multiple POPs components'
    )
  })

  it('fails when wasteItems is empty', () => {
    const result = runScenarioP01Tests(buildWasteInput({ wasteItems: [] }))

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected one or more waste items to have multiple POPs components'
    )
  })

  it('fails when wasteItems is missing', () => {
    const result = runScenarioP01Tests({ receipt: { movement: {} } })

    expect(result.status).toBe(PAT_STATUS.FAIL)
    expect(result.message).toBe(
      'Expected one or more waste items to have multiple POPs components'
    )
  })
})
