import {
  apiCode,
  brokerOrDealerEntry,
  supportingReference,
  carrier,
  validatorFor
} from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/receipt/record-receipt-without-delivery-request.schema.json'
)
const reason = 'No delivery'

describe('record-receipt-without-delivery-request schema', () => {
  const brokerOrDealer = { isPresent: true, items: [brokerOrDealerEntry] }

  test('accepts a valid payload', () => {
    expect(validateAjv({ reason, carrier }).valid).toBe(true)
  })

  // apiCode is sent in the x-api-code header, not the body.
  test('rejects apiCode in the body', () => {
    expect(validateAjv({ apiCode, reason, carrier }).valid).toBe(false)
  })

  test('reason is required', () => {
    expect(validateAjv({ carrier }).valid).toBe(false)
  })

  test('rejects an empty reason', () => {
    expect(validateAjv({ reason: '', carrier }).valid).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    expect(validateAjv({ reason, carrier, extra: 'not allowed' }).valid).toBe(
      false
    )
  })

  // carrier's own rules are covered by carrier.test.js — these confirm
  // it's required, that it's a single carrier rather than a list, and that the
  // $ref wiring is live.
  describe('carrier', () => {
    test('is required', () => {
      const { valid, errors } = validateAjv({ reason })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'carrier' }
        })
      )
    })

    test('rejects a list of carriers', () => {
      const { valid, errors } = validateAjv({
        reason,
        carrier: [carrier]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/carrier' })
      )
    })

    test('rejects a payload whose carrier is invalid', () => {
      const { organisationName, ...invalidCarrier } = carrier
      const { valid, errors } = validateAjv({
        reason,
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
        reason,
        carrier,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts a declared broker or dealer', () => {
      const payload = { reason, carrier, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    // The rules themselves live in broker-or-dealer.test.js; this only proves
    // the $ref is wired up, so a rejection propagates to the payload.
    test('rejects a payload whose broker or dealer is invalid', () => {
      const payload = {
        reason,
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
      const payload = { reason, carrier, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        reason,
        carrier,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose supportingReferences is invalid', () => {
      const payload = {
        reason,
        carrier,
        supportingReferences: [{ ...supportingReference, label: 'Not A Label' }]
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
