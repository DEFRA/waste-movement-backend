import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/receipt/record-receipt-without-delivery-response.schema.json'
)

describe('Feature: Record receipt without delivery response', () => {
  const body = {
    data: { deliveryId: '25KMT4Z9' },
    validation: { warnings: [] }
  }

  test('a response with a deliveryId and no warnings is accepted', () => {
    expect(validateAjv(body).valid).toBe(true)
  })

  test('a response is rejected when data is missing', () => {
    expect(validateAjv({ validation: { warnings: [] } }).valid).toBe(false)
  })

  test('a response is rejected when deliveryId is missing', () => {
    expect(validateAjv({ ...body, data: {} }).valid).toBe(false)
  })

  test('a response is rejected when deliveryId is not a string', () => {
    expect(validateAjv({ ...body, data: { deliveryId: 42 } }).valid).toBe(false)
  })

  // Like the spec, sets no additionalProperties.
  test('a response with extra properties is accepted', () => {
    expect(validateAjv({ ...body, extra: true }).valid).toBe(true)
  })
})
