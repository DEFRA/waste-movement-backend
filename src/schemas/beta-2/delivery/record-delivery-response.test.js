import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/delivery/record-delivery-response.schema.json'
)

describe('Feature: Record delivery response', () => {
  const delivery = {
    deliveryId: '25KMT4Z9',
    movementIds: ['25HRA0B1', '25HRA0B2'],
    wasteType: 'NON_HAZARDOUS'
  }
  const withDeliveries = (deliveries) => ({ data: { deliveries } })

  test('a response with one delivery is accepted', () => {
    expect(validateAjv(withDeliveries([delivery])).valid).toBe(true)
  })

  test('a response with a delivery per waste type is accepted', () => {
    const hazardous = {
      ...delivery,
      deliveryId: '25KMT4Z8',
      wasteType: 'HAZARDOUS'
    }
    expect(validateAjv(withDeliveries([delivery, hazardous])).valid).toBe(true)
  })

  test('a response is rejected when data is missing', () => {
    expect(validateAjv({}).valid).toBe(false)
  })

  test('a response is rejected when deliveries is missing', () => {
    expect(validateAjv({ data: {} }).valid).toBe(false)
  })

  test.each(['deliveryId', 'movementIds', 'wasteType'])(
    'a response is rejected when a delivery has no %s',
    (field) => {
      const { [field]: _omitted, ...rest } = delivery
      expect(validateAjv(withDeliveries([rest])).valid).toBe(false)
    }
  )

  test('a response is rejected when a delivery covers no movements', () => {
    expect(
      validateAjv(withDeliveries([{ ...delivery, movementIds: [] }])).valid
    ).toBe(false)
  })

  test('a response is rejected when a delivery has an unknown wasteType', () => {
    expect(
      validateAjv(withDeliveries([{ ...delivery, wasteType: 'INERT' }])).valid
    ).toBe(false)
  })

  // Like the spec, sets no additionalProperties.
  test('a response with extra properties is accepted', () => {
    expect(
      validateAjv({ ...withDeliveries([{ ...delivery, extra: 1 }]), extra: 1 })
        .valid
    ).toBe(true)
  })
})
