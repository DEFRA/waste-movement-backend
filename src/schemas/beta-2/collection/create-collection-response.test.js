import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/collection/create-collection-response.schema.json'
)

describe('Feature: Create collection response', () => {
  const body = { data: null }

  test('a response with null data is accepted', () => {
    expect(validateAjv(body).valid).toBe(true)
  })

  test('a response with object data is accepted', () => {
    expect(validateAjv({ ...body, data: {} }).valid).toBe(true)
  })

  test('a response is rejected when data is missing', () => {
    expect(validateAjv({}).valid).toBe(false)
  })

  test('a response is rejected when data is neither an object nor null', () => {
    expect(validateAjv({ ...body, data: 'collection' }).valid).toBe(false)
  })

  // `validation` is not modelled (undecided, may be removed) but routes still
  // return it, so it must pass as an unmodelled property.
  test('a response carrying the validation envelope is accepted', () => {
    expect(
      validateAjv({ data: null, validation: { warnings: [] } }).valid
    ).toBe(true)
  })

  // Like the spec, sets no additionalProperties.
  test('a response with extra properties is accepted', () => {
    expect(validateAjv({ ...body, extra: true }).valid).toBe(true)
  })
})
