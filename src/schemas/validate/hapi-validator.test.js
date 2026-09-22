import {
  jsonSchemaValidator,
  jsonSchemaValidatorFor
} from './hapi-validator.js'

const schemaId = 'beta-2/common/producer/producer-base.schema.json'

describe('jsonSchemaValidator', () => {
  test('returns the value unchanged when it is valid', () => {
    const value = { councilMovement: true }

    expect(jsonSchemaValidator(schemaId)(value)).toBe(value)
  })

  test('throws a Boom badRequest when the value is invalid', () => {
    expect(() => jsonSchemaValidator(schemaId)({})).toThrow(
      '"councilMovement" is required'
    )
  })
})

describe('jsonSchemaValidatorFor', () => {
  test('resolves the schema id from a version and name', () => {
    const validate = jsonSchemaValidatorFor('beta-2')(
      'common/producer/producer-base'
    )
    const value = { councilMovement: true }

    expect(validate(value)).toBe(value)
  })
})
