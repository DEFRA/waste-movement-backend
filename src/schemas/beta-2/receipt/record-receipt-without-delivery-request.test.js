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
    expect(validateAjv({ apiCode, reason }).valid).toBe(true)
  })

  test('apiCode is required', () => {
    expect(validateAjv({ reason }).valid).toBe(false)
  })

  test('rejects a malformed apiCode', () => {
    expect(validateAjv({ apiCode: 'not-a-uuid', reason }).valid).toBe(false)
  })

  test('reason is required', () => {
    expect(validateAjv({ apiCode }).valid).toBe(false)
  })

  test('rejects an empty reason', () => {
    expect(validateAjv({ apiCode, reason: '' }).valid).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    expect(validateAjv({ apiCode, reason, extra: 'not allowed' }).valid).toBe(
      false
    )
  })

  describe('brokerOrDealer', () => {
    test('is optional', () => {
      const payload = {
        apiCode,
        reason,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts a declared broker or dealer', () => {
      const payload = { apiCode, reason, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    // The rules themselves live in broker-or-dealer.test.js; this only proves
    // the $ref is wired up, so a rejection propagates to the payload.
    test('rejects a payload whose broker or dealer is invalid', () => {
      const payload = {
        apiCode,
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
      const payload = { apiCode, reason, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        apiCode,
        reason,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose supportingReferences is invalid', () => {
      const payload = {
        apiCode,
        reason,
        supportingReferences: [{ ...supportingReference, label: 'Not A Label' }]
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
