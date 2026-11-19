import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/collection/record-collection-response.schema.json'
)

describe('Feature: Record collection response', () => {
  const body = {
    data: { collectionId: '3f2b8c1e-6d4a-4f7e-9b2c-8a1d5e7f0c9b' },
    validation: { warnings: [] }
  }

  test('a response with a collectionId is accepted', () => {
    expect(validateAjv(body).valid).toBe(true)
  })

  test('a response is rejected when data is missing', () => {
    expect(validateAjv({ validation: { warnings: [] } }).valid).toBe(false)
  })

  test.each([
    ['null', null],
    ['an empty object', {}],
    ['a string', 'collection'],
    ['a collectionId that is not a UUID', { collectionId: 'not-a-uuid' }],
    [
      'an extra property',
      { collectionId: '3f2b8c1e-6d4a-4f7e-9b2c-8a1d5e7f0c9b', extra: true }
    ]
  ])('a response is rejected when data is %s', (_, data) => {
    expect(validateAjv({ ...body, data }).valid).toBe(false)
  })

  test('a response is rejected when it has an extra property', () => {
    expect(validateAjv({ ...body, extra: true }).valid).toBe(false)
  })
})
