import { apiCode, validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('beta-2/delivery/record-delivery.schema.json')

describe('record-delivery schema', () => {
  test('accepts a valid payload', () => {
    expect(validateAjv({ apiCode, movementIds: ['25HRA0B2'] }).valid).toBe(true)
  })

  test('accepts multiple movementIds', () => {
    expect(
      validateAjv({ apiCode, movementIds: ['25HRA0B2', '25HRA0B3'] }).valid
    ).toBe(true)
  })

  test('apiCode is required', () => {
    expect(validateAjv({ movementIds: ['25HRA0B2'] }).valid).toBe(false)
  })

  test('rejects a malformed apiCode', () => {
    expect(
      validateAjv({ apiCode: 'not-a-uuid', movementIds: ['25HRA0B2'] }).valid
    ).toBe(false)
  })

  test('movementIds is required', () => {
    expect(validateAjv({ apiCode }).valid).toBe(false)
  })

  test('rejects an empty movementIds list', () => {
    expect(validateAjv({ apiCode, movementIds: [] }).valid).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    expect(
      validateAjv({ apiCode, movementIds: ['25HRA0B2'], extra: 'not allowed' })
        .valid
    ).toBe(false)
  })
})
