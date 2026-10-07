import {
  apiCode,
  brokerOrDealerEntry,
  carrier,
  commercialProducer,
  householdProducer,
  municipalProducer,
  supportingReference,
  validatorFor
} from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/creation/create-movement-request.schema.json'
)

const intendedCarriers = [carrier]

describe('create-movement-request schema', () => {
  test('apiCode is required', () => {
    const payload = { producer: householdProducer, intendedCarriers }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('producer is required', () => {
    const payload = { apiCode, intendedCarriers }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test.each([
    ['Household', householdProducer],
    ['Commercial', commercialProducer],
    ['Municipal', municipalProducer]
  ])('accepts a valid %s producer', (_wasteSource, producer) => {
    const payload = { apiCode, producer, intendedCarriers }
    expect(validateAjv(payload).valid).toBe(true)
  })

  test('rejects a malformed apiCode', () => {
    const payload = {
      apiCode: 'not-a-uuid',
      producer: householdProducer,
      intendedCarriers
    }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    const payload = {
      apiCode,
      producer: householdProducer,
      intendedCarriers,
      extra: 'not allowed'
    }
    expect(validateAjv(payload).valid).toBe(false)
  })

  // A single carrier's rules are covered by carrier.test.js — these
  // cover the list itself and confirm each entry is checked against
  // carrier.schema.json.
  describe('intendedCarriers', () => {
    // Scenario: A Movement isn't created when no intended carrier is declared.
    test('is required', () => {
      const { valid, errors } = validateAjv({
        apiCode,
        producer: householdProducer
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'intendedCarriers' }
        })
      )
    })

    test('rejects an empty list of carriers', () => {
      const { valid, errors } = validateAjv({
        apiCode,
        producer: householdProducer,
        intendedCarriers: []
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'minItems',
          instancePath: '/intendedCarriers'
        })
      )
    })

    test('rejects a single carrier rather than a list', () => {
      const { valid, errors } = validateAjv({
        apiCode,
        producer: householdProducer,
        intendedCarriers: carrier
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/intendedCarriers'
        })
      )
    })

    test('accepts one carrier', () => {
      const payload = { apiCode, producer: householdProducer, intendedCarriers }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts more than one carrier', () => {
      const payload = {
        apiCode,
        producer: householdProducer,
        intendedCarriers: [
          carrier,
          { ...carrier, organisationName: 'Second Carrier Ltd' }
        ]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose carrier is invalid', () => {
      const { organisationName, ...invalidCarrier } = carrier
      const { valid, errors } = validateAjv({
        apiCode,
        producer: householdProducer,
        intendedCarriers: [invalidCarrier]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/intendedCarriers/0',
          params: { missingProperty: 'organisationName' }
        })
      )
    })

    test('rejects the list when any one carrier is invalid, reporting the error against that carrier', () => {
      const { organisationName, ...invalidSecond } = carrier
      const { valid, errors } = validateAjv({
        apiCode,
        producer: householdProducer,
        intendedCarriers: [carrier, invalidSecond]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/intendedCarriers/1',
          params: { missingProperty: 'organisationName' }
        })
      )
      expect(
        errors.filter(({ instancePath }) =>
          instancePath.startsWith('/intendedCarriers/0')
        )
      ).toEqual([])
    })
  })

  describe('brokerOrDealer', () => {
    const brokerOrDealer = { isPresent: true, items: [brokerOrDealerEntry] }

    test('is optional', () => {
      const payload = { apiCode, producer: householdProducer, intendedCarriers }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts a declared broker or dealer', () => {
      const payload = {
        apiCode,
        producer: householdProducer,
        intendedCarriers,
        brokerOrDealer
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    // The rules themselves live in broker-or-dealer.test.js; this only proves
    // the $ref is wired up, so a rejection propagates to the payload.
    test('rejects a payload whose broker or dealer is invalid', () => {
      const payload = {
        apiCode,
        producer: householdProducer,
        intendedCarriers,
        brokerOrDealer: { isPresent: false, items: brokerOrDealer.items }
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })

  // supportingReferences' own rules are covered by
  // supporting-references.test.js — these confirm it's optional and that the
  // $ref wiring is live.
  describe('supportingReferences', () => {
    test('is optional', () => {
      const payload = { apiCode, producer: householdProducer, intendedCarriers }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        apiCode,
        producer: householdProducer,
        intendedCarriers,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })
  })

  // specialHandlingRequirements' own rules are covered by
  // special-handling-requirements.test.js — these confirm it's optional and
  // that the $ref wiring is live.
  describe('specialHandlingRequirements', () => {
    // Scenario: A Movement is successfully created without special handling
    // requirements.
    test('is optional', () => {
      const payload = { apiCode, producer: householdProducer, intendedCarriers }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid specialHandlingRequirements', () => {
      const payload = {
        apiCode,
        producer: householdProducer,
        intendedCarriers,
        specialHandlingRequirements: 'Handle with care and keep upright.'
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose specialHandlingRequirements is invalid', () => {
      const payload = {
        apiCode,
        producer: householdProducer,
        intendedCarriers,
        specialHandlingRequirements: 'A'.repeat(501)
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
