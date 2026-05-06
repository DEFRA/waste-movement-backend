import { productionApprovalTestsSchema } from './production-approval-tests.js'
import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'
import { PRODUCTION_APPROVAL_TEST_SCENARIO_IDS } from '../common/constants/production-approval-tests.js'
import { productionApprovalTestsRequestPayload } from '../test/data/production-approval-tests.js'

describe('productionApprovalTestsSchema', () => {
  let payload

  beforeEach(() => {
    payload = JSON.parse(JSON.stringify(productionApprovalTestsRequestPayload))
  })

  it('should accept when given a valid payload', () => {
    const { error } = productionApprovalTestsSchema.validate(payload)

    expect(error).toBeUndefined()
  })

  it('should accept when given a valid payload with duplicated wasteTrackingIds for different scenarioIds', () => {
    payload[1].wasteTrackingId = payload[0].wasteTrackingId

    const { error } = productionApprovalTestsSchema.validate(payload)

    expect(error).toBeUndefined()
  })

  it.each([{}, null])(
    'should reject when payload is not an array: "%s"',
    (payload) => {
      const { error } = productionApprovalTestsSchema.validate(payload)

      expect(error).toBeDefined()
      expect(error.message).toEqual(
        '"ProductionApprovalTestRequest" must be an array'
      )
    }
  )

  it('should reject when payload is undefined', () => {
    payload = undefined

    const { error } = productionApprovalTestsSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"ProductionApprovalTestRequest" is required')
  })

  it('should reject when payload is an empty array', () => {
    payload = []

    const { error } = productionApprovalTestsSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"ProductionApprovalTestRequest" must contain at least 1 items'
    )
  })

  it('should reject when scenarioId is not given', () => {
    payload[0].scenarioId = undefined

    const { error } = productionApprovalTestsSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"[0].scenarioId" is required')
  })

  it('should reject when wasteTrackingId is not given', () => {
    payload[0].wasteTrackingId = undefined

    const { error } = productionApprovalTestsSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"[0].wasteTrackingId" is required')
  })

  it('should reject when scenarioId is an invalid value', () => {
    payload[0].scenarioId = 'A01'

    const { error } = productionApprovalTestsSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"[0].scenarioId" must be one of [R01, R02, R03, R04, R05, R07, C02, B01, P01, H01, H03, X01]'
    )
  })

  it('should reject when wasteTrackingId is not a string', () => {
    payload[0].wasteTrackingId = 12

    const { error } = productionApprovalTestsSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"[0].wasteTrackingId" must be a string')
  })

  it('should reject when multiple wasteTrackingId values are given for a single scenarioId', () => {
    payload[0] = {
      scenarioId: PRODUCTION_APPROVAL_TEST_SCENARIO_IDS.R01,
      wasteTrackingId: [generateWasteTrackingId(), generateWasteTrackingId()]
    }

    const { error } = productionApprovalTestsSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"[0].wasteTrackingId" must be a string')
  })

  it('should reject when a duplicated scenarioId is given with the same wasteTrackingId', () => {
    payload[2] = payload[0]

    const { error } = productionApprovalTestsSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"ProductionApprovalTestRequest" contains a duplicate scenarioId value'
    )
  })

  it('should reject when a duplicated scenarioId is given with a different wasteTrackingId', () => {
    payload[2] = {
      scenarioId: payload[0].scenarioId,
      wasteTrackingId: generateWasteTrackingId()
    }

    const { error } = productionApprovalTestsSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"ProductionApprovalTestRequest" contains a duplicate scenarioId value'
    )
  })

  it('should reject when an invalid property is given', () => {
    payload[0].scenario = PRODUCTION_APPROVAL_TEST_SCENARIO_IDS.R01

    const { error } = productionApprovalTestsSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"[0].scenario" is not allowed')
  })
})
