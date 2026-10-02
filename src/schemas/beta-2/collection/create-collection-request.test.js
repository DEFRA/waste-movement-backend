import {
  apiCode,
  brokerOrDealerEntry,
  supportingReference,
  validatorFor
} from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/collection/create-collection-request.schema.json'
)

describe('create-collection-request schema: beta-2', () => {
  const brokerOrDealer = { isPresent: true, items: [brokerOrDealerEntry] }

  test('accepts a payload with only an apiCode', () => {
    expect(validateAjv({ apiCode }).valid).toBe(true)
  })

  test('apiCode is required', () => {
    const payload = {}
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('rejects a malformed apiCode', () => {
    const payload = { apiCode: 'not-a-uuid' }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    const payload = {
      apiCode,
      extra: 'not allowed'
    }
    expect(validateAjv(payload).valid).toBe(false)
  })

  describe('brokerOrDealer', () => {
    test('is optional', () => {
      const payload = { apiCode, supportingReferences: [supportingReference] }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts a declared broker or dealer', () => {
      const payload = { apiCode, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    // The rules themselves live in broker-or-dealer.test.js; this only proves
    // the $ref is wired up, so a rejection propagates to the payload.
    test('rejects a payload whose broker or dealer is invalid', () => {
      const payload = {
        apiCode,
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
      const payload = { apiCode, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        apiCode,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })
  })
})
