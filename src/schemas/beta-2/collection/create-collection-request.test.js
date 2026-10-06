import {
  apiCode,
  brokerOrDealerEntry,
  carrier,
  supportingReference,
  validatorFor
} from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/collection/create-collection-request.schema.json'
)

describe('create-collection-request schema: beta-2', () => {
  const brokerOrDealer = { isPresent: true, items: [brokerOrDealerEntry] }

  test('accepts a payload with only an apiCode and a carrier', () => {
    expect(validateAjv({ apiCode, carrier }).valid).toBe(true)
  })

  test('apiCode is required', () => {
    const payload = { carrier }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('rejects a malformed apiCode', () => {
    const payload = { apiCode: 'not-a-uuid', carrier }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    const payload = {
      apiCode,
      carrier,
      extra: 'not allowed'
    }
    expect(validateAjv(payload).valid).toBe(false)
  })

  // carrier's own rules are covered by carrier/carrier.test.js — these confirm
  // it's required, that it's a single carrier rather than a list, and that the
  // $ref wiring is live.
  describe('carrier', () => {
    test('is required', () => {
      const { valid, errors } = validateAjv({ apiCode })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'carrier' }
        })
      )
    })

    test('accepts a valid carrier', () => {
      expect(validateAjv({ apiCode, carrier }).valid).toBe(true)
    })

    test('rejects a list of carriers', () => {
      const { valid, errors } = validateAjv({ apiCode, carrier: [carrier] })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/carrier' })
      )
    })

    test('rejects a payload whose carrier is invalid', () => {
      const { organisationName, ...invalidCarrier } = carrier
      const { valid, errors } = validateAjv({
        apiCode,
        carrier: invalidCarrier
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/carrier',
          params: { missingProperty: 'organisationName' }
        })
      )
    })
  })

  describe('brokerOrDealer', () => {
    test('is optional', () => {
      const payload = {
        apiCode,
        carrier,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts a declared broker or dealer', () => {
      const payload = { apiCode, carrier, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    // The rules themselves live in broker-or-dealer.test.js; this only proves
    // the $ref is wired up, so a rejection propagates to the payload.
    test('rejects a payload whose broker or dealer is invalid', () => {
      const payload = {
        apiCode,
        carrier,
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
      const payload = { apiCode, carrier, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        apiCode,
        carrier,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })
  })

  // specialHandlingRequirements' own rules are covered by
  // special-handling-requirements.test.js — these confirm it's optional and
  // that the $ref wiring is live.
  describe('specialHandlingRequirements', () => {
    test('is optional', () => {
      const payload = { apiCode, carrier, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid specialHandlingRequirements', () => {
      const payload = {
        apiCode,
        carrier,
        specialHandlingRequirements: 'Handle with care and keep upright.'
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose specialHandlingRequirements is invalid', () => {
      const payload = {
        apiCode,
        carrier,
        specialHandlingRequirements: 'A'.repeat(501)
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
