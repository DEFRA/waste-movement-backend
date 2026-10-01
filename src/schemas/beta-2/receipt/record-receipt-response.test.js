import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/receipt/record-receipt-response.schema.json'
)

describe('Feature: Record receipt response', () => {
  const body = {
    data: { deliveryId: '25KMT4Z9' }
  }

  test('a response with a deliveryId is accepted', () => {
    expect(validateAjv(body).valid).toBe(true)
  })

  test('a response is rejected when data is missing', () => {
    expect(validateAjv({}).valid).toBe(false)
  })

  test('a response is rejected when deliveryId is missing', () => {
    expect(validateAjv({ ...body, data: {} }).valid).toBe(false)
  })

  test('a response is rejected when deliveryId is not a string', () => {
    expect(validateAjv({ ...body, data: { deliveryId: 42 } }).valid).toBe(false)
  })

  // `validation` is not modelled (undecided, may be removed) but routes still
  // return it, so it must pass as an unmodelled property.
  test('a response carrying the validation envelope is accepted', () => {
    expect(
      validateAjv({
        data: { deliveryId: '25KMT4Z9' },
        validation: { warnings: [] }
      }).valid
    ).toBe(true)
  })

  // Like the spec, sets no additionalProperties.
  test('a response with extra properties is accepted', () => {
    expect(validateAjv({ ...body, extra: true }).valid).toBe(true)
  })
})
