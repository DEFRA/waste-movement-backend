import { validate, getErrors, ajv } from './index.js'

describe('schema registry', () => {
  test('loads schemas keyed by their path relative to src/schemas/', () => {
    expect(
      ajv.getSchema('beta-2/common/producer/producer-base.schema.json')
    ).toBeDefined()
  })

  test('resolves relative $refs against the registering path', () => {
    // producer.schema.json $refs bare siblings, which in turn $ref
    // ../address.schema.json across folders. ajv compiles lazily, so this
    // getSchema call is what resolves them, and it throws unless the path
    // key became the schema's base URI.
    expect(() =>
      ajv.getSchema('beta-2/common/producer/producer.schema.json')
    ).not.toThrow()
  })

  test('validates a payload against a registered schema', () => {
    const valid = validate('beta-2/common/producer/producer-base.schema.json', {
      councilMovement: true
    })

    expect(valid).toBe(true)
    expect(getErrors('beta-2/common/producer/producer-base.schema.json')).toBe(
      null
    )
  })

  test('exposes errors after a failed validation', () => {
    const valid = validate(
      'beta-2/common/producer/producer-base.schema.json',
      {}
    )

    expect(valid).toBe(false)
    expect(
      getErrors('beta-2/common/producer/producer-base.schema.json')
    ).not.toBeNull()
  })

  test('throws for an unregistered path', () => {
    expect(() => validate('does/not/exist.schema.json', {})).toThrow(
      'No schema registered under "does/not/exist.schema.json".'
    )
  })
})
