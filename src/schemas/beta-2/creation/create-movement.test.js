import { getErrors, validate } from '../../validate/index.js'

const schemaId = 'beta-2/creation/create-movement.schema.json'

const validateAjv = (payload) => {
  const valid = validate(schemaId, payload)
  return { valid, errors: valid ? null : getErrors(schemaId) }
}

const apiCode = '25b14080-5e77-4f91-9957-2482a0cb8775'

const householdProducer = {
  wasteSource: 'Household',
  councilMovement: true
}

const commercialProducer = {
  wasteSource: 'Commercial',
  organisationName: 'ACME Waste Producers Ltd',
  authorisationNumber: 'EAS/P/123456',
  address: {
    fullAddress: '10 Industrial Way, Test City',
    postcode: 'TE1 2PQ'
  },
  emailAddress: 'producer@example.com',
  sicCode: '38110',
  councilMovement: false
}

const municipalProducer = {
  wasteSource: 'Municipal',
  organisationName: 'Test Council',
  reasonForNoAuthorisationNumber: 'TBC',
  address: {
    fullAddress: 'Council Depot, Test City',
    postcode: 'TE1 5CD'
  },
  emailAddress: 'waste.services@example.gov.uk',
  councilMovement: true
}

describe('create-movement schema', () => {
  test('apiCode is required', () => {
    const payload = { producer: householdProducer }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('producer is required', () => {
    const payload = { apiCode }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test.each([
    ['Household', householdProducer],
    ['Commercial', commercialProducer],
    ['Municipal', municipalProducer]
  ])('accepts a valid %s producer', (_wasteSource, producer) => {
    const payload = { apiCode, producer }
    expect(validateAjv(payload).valid).toBe(true)
  })

  test('rejects a malformed apiCode', () => {
    const payload = { apiCode: 'not-a-uuid', producer: householdProducer }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('rejects an additional property beyond apiCode and producer', () => {
    const payload = {
      apiCode,
      producer: householdProducer,
      extra: 'not allowed'
    }
    expect(validateAjv(payload).valid).toBe(false)
  })
})
