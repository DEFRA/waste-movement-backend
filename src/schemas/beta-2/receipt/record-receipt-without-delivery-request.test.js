import { apiCode, validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/receipt/record-receipt-without-delivery-request.schema.json'
)
const reason = 'No delivery'

describe('record-receipt-without-delivery-request schema', () => {
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
})
