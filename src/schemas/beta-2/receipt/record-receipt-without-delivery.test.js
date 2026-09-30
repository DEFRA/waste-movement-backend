import { getErrors, validate } from '../../validate/index.js'

const schemaId = 'beta-2/receipt/record-receipt-without-delivery.schema.json'

const validateAjv = (payload) => {
  const valid = validate(schemaId, payload)
  return { valid, errors: valid ? null : getErrors(schemaId) }
}

const apiCode = '25b14080-5e77-4f91-9957-2482a0cb8775'
const reason = 'No delivery'

describe('record-receipt-without-delivery schema', () => {
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
