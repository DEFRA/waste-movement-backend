import {
  apiCode,
  brokerOrDealerEntry,
  commercialProducer,
  householdProducer,
  municipalProducer,
  supportingReference,
  validatorFor
} from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/creation/create-movement-request.schema.json'
)

describe('create-movement-request schema', () => {
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

  test('rejects an additional property beyond the declared ones', () => {
    const payload = {
      apiCode,
      producer: householdProducer,
      extra: 'not allowed'
    }
    expect(validateAjv(payload).valid).toBe(false)
  })

  describe('brokerOrDealer', () => {
    const brokerOrDealer = { isPresent: true, items: [brokerOrDealerEntry] }

    test('is optional', () => {
      const payload = { apiCode, producer: householdProducer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts a declared broker or dealer', () => {
      const payload = { apiCode, producer: householdProducer, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    // The rules themselves live in broker-or-dealer.test.js; this only proves
    // the $ref is wired up, so a rejection propagates to the payload.
    test('rejects a payload whose broker or dealer is invalid', () => {
      const payload = {
        apiCode,
        producer: householdProducer,
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
      const payload = { apiCode, producer: householdProducer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        apiCode,
        producer: householdProducer,
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
      const payload = { apiCode, producer: householdProducer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid specialHandlingRequirements', () => {
      const payload = {
        apiCode,
        producer: householdProducer,
        specialHandlingRequirements: 'Handle with care and keep upright.'
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose specialHandlingRequirements is invalid', () => {
      const payload = {
        apiCode,
        producer: householdProducer,
        specialHandlingRequirements: 'A'.repeat(501)
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
