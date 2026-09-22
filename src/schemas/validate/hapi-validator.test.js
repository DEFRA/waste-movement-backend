import { jsonSchemaValidator } from './hapi-validator.js'

const schemaId = 'beta-2/common/producer/producer-base.schema.json'

describe('jsonSchemaValidator', () => {
  test('returns the value unchanged when it is valid', () => {
    const value = { councilMovement: true }

    expect(jsonSchemaValidator(schemaId)(value)).toBe(value)
  })

  test('throws a Boom badRequest when the value is invalid', () => {
    expect(() => jsonSchemaValidator(schemaId)({})).toThrow(
      'Payload validation failed'
    )
  })
})
