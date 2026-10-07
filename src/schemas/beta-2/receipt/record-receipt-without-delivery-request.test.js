import {
  apiCode,
  brokerOrDealerEntry,
  supportingReference,
  validatorFor
} from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/receipt/record-receipt-without-delivery-request.schema.json'
)
const reason = 'No delivery'

describe('record-receipt-without-delivery-request schema', () => {
  const brokerOrDealer = { isPresent: true, items: [brokerOrDealerEntry] }

  test('accepts a valid payload', () => {
    expect(validateAjv({ reason }).valid).toBe(true)
  })

  // apiCode is sent in the x-api-code header, not the body.
  test('rejects apiCode in the body', () => {
    expect(validateAjv({ apiCode, reason }).valid).toBe(false)
  })

  test('reason is required', () => {
    expect(validateAjv({}).valid).toBe(false)
  })

  test('rejects an empty reason', () => {
    expect(validateAjv({ reason: '' }).valid).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    expect(validateAjv({ reason, extra: 'not allowed' }).valid).toBe(false)
  })

  describe('brokerOrDealer', () => {
    test('is optional', () => {
      const payload = {
        reason,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts a declared broker or dealer', () => {
      const payload = { reason, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    // The rules themselves live in broker-or-dealer.test.js; this only proves
    // the $ref is wired up, so a rejection propagates to the payload.
    test('rejects a payload whose broker or dealer is invalid', () => {
      const payload = {
        reason,
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
      const payload = { reason, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        reason,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose supportingReferences is invalid', () => {
      const payload = {
        reason,
        supportingReferences: [{ ...supportingReference, label: 'Not A Label' }]
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
