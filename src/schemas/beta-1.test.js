import { getErrors, validate } from './validate/index.js'
import { apiCode1 } from '../test/data/apiCodes.js'

const validateAjv = (id, payload) => {
  const valid = validate(id, payload)
  return { valid, errors: valid ? null : getErrors(id) }
}

describe('beta-1/create-movement-request.schema.json', () => {
  const schemaId = 'beta-1/create-movement-request.schema.json'

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

describe('beta-1/record-delivery-request.schema.json', () => {
  const schemaId = 'beta-1/record-delivery-request.schema.json'

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

describe('beta-1/record-receipt-without-delivery-request.schema.json', () => {
  const schemaId = 'beta-1/record-receipt-without-delivery-request.schema.json'

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

describe('beta-1/create-movement-response.schema.json', () => {
  const schemaId = 'beta-1/create-movement-response.schema.json'
  const body = {
    data: { movementId: '25HRA0B2' },
    validation: { warnings: [] }
  }

  it('accepts a valid body', () => {
    expect(validateAjv(schemaId, body).valid).toBe(true)
  })

  it('requires data', () => {
    const { data: _omitted, ...rest } = body
    expect(validateAjv(schemaId, rest).valid).toBe(false)
  })

  it('requires movementId', () => {
    expect(validateAjv(schemaId, { ...body, data: {} }).valid).toBe(false)
  })

  // Like the spec, sets no additionalProperties.
  it('accepts extra properties', () => {
    expect(validateAjv(schemaId, { ...body, extra: true }).valid).toBe(true)
  })
})

describe('beta-1/create-collection-response.schema.json', () => {
  const schemaId = 'beta-1/create-collection-response.schema.json'
  const body = { data: null, validation: { warnings: [] } }

  it('accepts null data', () => {
    expect(validateAjv(schemaId, body).valid).toBe(true)
  })

  it('requires data', () => {
    const { data: _omitted, ...rest } = body
    expect(validateAjv(schemaId, rest).valid).toBe(false)
  })

  it('rejects data that is neither an object nor null', () => {
    expect(validateAjv(schemaId, { ...body, data: 'x' }).valid).toBe(false)
  })

  // Like the spec, sets no additionalProperties.
  it('accepts extra properties', () => {
    expect(validateAjv(schemaId, { ...body, extra: true }).valid).toBe(true)
  })
})

describe('beta-1/record-delivery-response.schema.json', () => {
  const schemaId = 'beta-1/record-delivery-response.schema.json'
  const delivery = {
    deliveryId: '25KMT4Z9',
    movementIds: ['25HRA0B2'],
    wasteType: 'NON_HAZARDOUS'
  }
  const withDeliveries = (deliveries) => ({
    data: { deliveries },
    validation: { warnings: [] }
  })

  it('accepts a valid body', () => {
    expect(validateAjv(schemaId, withDeliveries([delivery])).valid).toBe(true)
  })

  it('requires deliveries', () => {
    expect(
      validateAjv(schemaId, { ...withDeliveries([]), data: {} }).valid
    ).toBe(false)
  })

  it('rejects a delivery with empty movementIds', () => {
    expect(
      validateAjv(schemaId, withDeliveries([{ ...delivery, movementIds: [] }]))
        .valid
    ).toBe(false)
  })

  it('rejects a delivery with an unknown wasteType', () => {
    expect(
      validateAjv(schemaId, withDeliveries([{ ...delivery, wasteType: 'X' }]))
        .valid
    ).toBe(false)
  })

  it('rejects a delivery without a deliveryId', () => {
    const { deliveryId: _omitted, ...rest } = delivery
    expect(validateAjv(schemaId, withDeliveries([rest])).valid).toBe(false)
  })

  // Like the spec, sets no additionalProperties.
  it('accepts extra properties', () => {
    expect(
      validateAjv(schemaId, withDeliveries([{ ...delivery, extra: 1 }])).valid
    ).toBe(true)
  })
})

describe.each([
  'beta-1/record-receipt-response.schema.json',
  'beta-1/record-receipt-without-delivery-response.schema.json'
])('%s', (schemaId) => {
  const body = {
    data: { deliveryId: '25KMT4Z9' },
    validation: { warnings: [] }
  }

  it('accepts a valid body', () => {
    expect(validateAjv(schemaId, body).valid).toBe(true)
  })

  it('requires data', () => {
    const { data: _omitted, ...rest } = body
    expect(validateAjv(schemaId, rest).valid).toBe(false)
  })

  it('requires deliveryId', () => {
    expect(validateAjv(schemaId, { ...body, data: {} }).valid).toBe(false)
  })

  // Like the spec, sets no additionalProperties.
  it('accepts extra properties', () => {
    expect(validateAjv(schemaId, { ...body, extra: true }).valid).toBe(true)
  })
})
