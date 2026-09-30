import { getErrors, validate } from '../../validate/index.js'

const schemaId = 'beta-2/collection/create-collection.schema.json'

const validateAjv = (payload) => {
  const valid = validate(schemaId, payload)
  return { valid, errors: valid ? null : getErrors(schemaId) }
}

const apiCode = '25b14080-5e77-4f91-9957-2482a0cb8775'

describe('create-collection schema', () => {
  test('accepts a valid payload', () => {
    expect(validateAjv({ apiCode }).valid).toBe(true)
  })

  test('apiCode is required', () => {
    expect(validateAjv({}).valid).toBe(false)
  })

  test('rejects a malformed apiCode', () => {
    expect(validateAjv({ apiCode: 'not-a-uuid' }).valid).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    expect(validateAjv({ apiCode, extra: 'not allowed' }).valid).toBe(false)
  })
})
