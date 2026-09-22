import { getErrors, validate } from './validate/index.js'
import { apiCode1 } from '../test/data/apiCodes.js'

const validateAjv = (id, payload) => {
  const valid = validate(id, payload)
  return { valid, errors: valid ? null : getErrors(id) }
}

describe('beta-1/create-movement.schema.json', () => {
  const schemaId = 'beta-1/create-movement.schema.json'

  it('accepts a valid payload', () => {
    expect(validateAjv(schemaId, { apiCode: apiCode1 }).valid).toBe(true)
  })

  it('requires apiCode', () => {
    expect(validateAjv(schemaId, {}).valid).toBe(false)
  })

  it('requires apiCode to be a uuid', () => {
    expect(validateAjv(schemaId, { apiCode: 'not-a-uuid' }).valid).toBe(false)
  })
})

describe('beta-1/record-delivery.schema.json', () => {
  const schemaId = 'beta-1/record-delivery.schema.json'

  it('accepts a valid payload', () => {
    expect(
      validateAjv(schemaId, { apiCode: apiCode1, movementIds: ['25HRA0B2'] })
        .valid
    ).toBe(true)
  })

  it('accepts multiple movementIds', () => {
    expect(
      validateAjv(schemaId, {
        apiCode: apiCode1,
        movementIds: ['25HRA0B2', '25HRA0B3']
      }).valid
    ).toBe(true)
  })

  it('requires apiCode', () => {
    expect(validateAjv(schemaId, { movementIds: ['25HRA0B2'] }).valid).toBe(
      false
    )
  })

  it('requires apiCode to be a uuid', () => {
    expect(
      validateAjv(schemaId, {
        apiCode: 'not-a-uuid',
        movementIds: ['25HRA0B2']
      }).valid
    ).toBe(false)
  })

  it('requires movementIds', () => {
    expect(validateAjv(schemaId, { apiCode: apiCode1 }).valid).toBe(false)
  })

  it('requires movementIds to be a non-empty array', () => {
    expect(
      validateAjv(schemaId, { apiCode: apiCode1, movementIds: [] }).valid
    ).toBe(false)
  })
})

describe('beta-1/record-receipt-without-delivery.schema.json', () => {
  const schemaId = 'beta-1/record-receipt-without-delivery.schema.json'

  it('accepts a valid payload', () => {
    expect(
      validateAjv(schemaId, { apiCode: apiCode1, reason: 'No delivery' }).valid
    ).toBe(true)
  })

  it('requires reason', () => {
    expect(validateAjv(schemaId, { apiCode: apiCode1 }).valid).toBe(false)
  })

  it('rejects an empty reason', () => {
    expect(validateAjv(schemaId, { apiCode: apiCode1, reason: '' }).valid).toBe(
      false
    )
  })
})
