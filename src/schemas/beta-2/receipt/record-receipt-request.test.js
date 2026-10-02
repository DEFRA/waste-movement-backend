import { apiCode, validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/receipt/record-receipt-request.schema.json'
)

describe('record-receipt-request schema', () => {
  test('accepts a valid payload', () => {
    expect(validateAjv({ apiCode }).valid).toBe(true)
  })

  test('apiCode is required', () => {
    expect(validateAjv({}).valid).toBe(false)
  })

  test('rejects a malformed apiCode', () => {
    expect(validateAjv({ apiCode: 'not-a-uuid' }).valid).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    expect(validateAjv({ apiCode, extra: 'not allowed' }).valid).toBe(false)
  })
})
