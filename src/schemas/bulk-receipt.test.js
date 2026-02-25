import {
  bulkReceiveMovementRequestSchema,
  bulkUpdateMovementRequestSchema
} from './bulk-receipt.js'
import { createBulkMovementRequest } from '../test/utils/createBulkMovementRequest.js'

jest.mock('../config.js', () => {
  process.env.MAX_BULK_RECORDS = '3'
  return jest.requireActual('../config.js')
})

describe('bulkReceiveMovementRequestSchema', () => {
  it('should accept valid payload', () => {
    const payload = [createBulkMovementRequest()]
    const { error } = bulkReceiveMovementRequestSchema.validate(payload)

    expect(error).toBeUndefined()
  })

  it('should return an error when the payload is not an array', () => {
    const payload = createBulkMovementRequest()
    const { error } = bulkReceiveMovementRequestSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"BulkReceiveMovementRequest" must be an array'
    )
  })

  it('should return an error when the payload is an empty array', () => {
    const payload = []
    const { error } = bulkReceiveMovementRequestSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"BulkReceiveMovementRequest" must contain at least 1 items'
    )
  })

  it('should return an error when the payload is null', () => {
    const payload = null
    const { error } = bulkReceiveMovementRequestSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"BulkReceiveMovementRequest" must be an array'
    )
  })

  it('should return an error when the payload is undefined', () => {
    const payload = undefined
    const { error } = bulkReceiveMovementRequestSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"BulkReceiveMovementRequest" is required')
  })

  it('should return an error when the payload exceeds the max record limit', () => {
    const payload = new Array(4).fill(createBulkMovementRequest())
    const { error } = bulkReceiveMovementRequestSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"BulkReceiveMovementRequest" must contain less than or equal to 3 items'
    )
  })
})

describe('bulkUpdateMovementRequestSchema', () => {
  it('should accept valid payload with wasteTrackingId', () => {
    const payload = [createBulkMovementRequest({ wasteTrackingId: '26E4C7Z2' })]
    const { error } = bulkUpdateMovementRequestSchema.validate(payload)

    expect(error).toBeUndefined()
  })

  it('should return an error when wasteTrackingId is missing', () => {
    const payload = [createBulkMovementRequest()]
    const { error } = bulkUpdateMovementRequestSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toContain('"[0].wasteTrackingId" is required')
  })

  it('should return an error when the payload is not an array', () => {
    const payload = createBulkMovementRequest({ wasteTrackingId: '26E4C7Z2' })
    const { error } = bulkUpdateMovementRequestSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"BulkUpdateMovementRequest" must be an array'
    )
  })

  it('should return an error when the payload is an empty array', () => {
    const payload = []
    const { error } = bulkUpdateMovementRequestSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"BulkUpdateMovementRequest" must contain at least 1 items'
    )
  })

  it('should return an error when the payload exceeds the max record limit', () => {
    const payload = new Array(4).fill(
      createBulkMovementRequest({ wasteTrackingId: '26E4C7Z2' })
    )
    const { error } = bulkUpdateMovementRequestSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"BulkUpdateMovementRequest" must contain less than or equal to 3 items'
    )
  })
})
