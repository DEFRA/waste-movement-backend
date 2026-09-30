import { getErrors, validate } from '../../validate/index.js'

const schemaId = 'beta-2/receipt/delivery-id-params.schema.json'

const validateAjv = (payload) => {
  const valid = validate(schemaId, payload)
  return { valid, errors: valid ? null : getErrors(schemaId) }
}

describe('delivery-id-params schema', () => {
  test('accepts a deliveryId', () => {
    expect(validateAjv({ deliveryId: '25KMT4Z9' }).valid).toBe(true)
  })

  test('deliveryId is required', () => {
    expect(validateAjv({}).valid).toBe(false)
  })

  test('rejects an additional param beyond the declared ones', () => {
    expect(
      validateAjv({ deliveryId: '25KMT4Z9', extra: 'not allowed' }).valid
    ).toBe(false)
  })
})
