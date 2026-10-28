import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/collection/create-collection-response.schema.json'
)

describe('Feature: Create collection response', () => {
  const body = { data: null, validation: { warnings: [] } }

  test('a response with null data is accepted', () => {
    expect(validateAjv(body).valid).toBe(true)
  })

  test('a response is rejected when data is missing', () => {
    expect(validateAjv({ validation: { warnings: [] } }).valid).toBe(false)
  })

  test.each([
    ['an empty object', {}],
    ['a string', 'collection']
  ])('a response is rejected when data is %s', (_, data) => {
    expect(validateAjv({ ...body, data }).valid).toBe(false)
  })

  test('a response is rejected when it has an extra property', () => {
    expect(validateAjv({ ...body, extra: true }).valid).toBe(false)
  })
})
