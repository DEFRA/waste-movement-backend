import { bulkReceiveMovementRequestSchema } from './bulk-receipt.js'
import { createBulkMovementRequest } from '../test/utils/createBulkMovementRequest.js'

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
})
