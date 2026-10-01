import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/creation/create-movement-response.schema.json'
)

describe('Feature: Create movement response', () => {
  const body = {
    data: { movementId: '25HRA0B2' }
  }

  test('a response with a movementId is accepted', () => {
    expect(validateAjv(body).valid).toBe(true)
  })

  test('a response is rejected when data is missing', () => {
    expect(validateAjv({}).valid).toBe(false)
  })

  test('a response is rejected when movementId is missing', () => {
    expect(validateAjv({ ...body, data: {} }).valid).toBe(false)
  })

  test('a response is rejected when movementId is not a string', () => {
    expect(validateAjv({ ...body, data: { movementId: 123 } }).valid).toBe(
      false
    )
  })

  // `validation` is not modelled (undecided, may be removed) but routes still
  // return it, so it must pass as an unmodelled property.
  test('a response carrying the validation envelope is accepted', () => {
    expect(
      validateAjv({
        data: { movementId: '25HRA0B2' },
        validation: { warnings: [] }
      }).valid
    ).toBe(true)
  })

  // Like the spec, sets no additionalProperties.
  test('a response with extra properties is accepted', () => {
    expect(
      validateAjv({ ...body, extra: true, data: { ...body.data, extra: 1 } })
        .valid
    ).toBe(true)
  })
})
