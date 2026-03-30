import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'
import { getReceiptMovementSchema } from './get-receipt-movement.js'

describe('getReceiptMovementSchema', () => {
  const wasteTrackingId = generateWasteTrackingId()
  const bulkId = 'cf5361f3-646e-4809-bb31-651065cc1836'
  const includeHistory = true

  it('should accept when given wasteTrackingId', () => {
    const params = {
      wasteTrackingId
    }

    const { error } = getReceiptMovementSchema.validate(params)

    expect(error).toBeUndefined()
  })

  it('should accept when given wasteTrackingId and includeHistory', () => {
    const params = {
      wasteTrackingId,
      includeHistory
    }

    const { error } = getReceiptMovementSchema.validate(params)

    expect(error).toBeUndefined()
  })

  it('should accept when given bulkId', () => {
    const params = {
      bulkId
    }

    const { error } = getReceiptMovementSchema.validate(params)

    expect(error).toBeUndefined()
  })

  it('should accept when given wasteTrackingId and bulkId', () => {
    const params = {
      wasteTrackingId,
      bulkId
    }

    const { error } = getReceiptMovementSchema.validate(params)

    expect(error).toBeUndefined()
  })

  it('should accept when given wasteTrackingId, bulkId and includeHistory', () => {
    const params = {
      wasteTrackingId,
      bulkId,
      includeHistory
    }

    const { error } = getReceiptMovementSchema.validate(params)

    expect(error).toBeUndefined()
  })

  it('should accept when includeHistory is a string boolean', () => {
    const params = {
      wasteTrackingId,
      includeHistory: 'true'
    }

    const { error } = getReceiptMovementSchema.validate(params)

    expect(error).toBeUndefined()
  })

  it('should reject when not given wasteTrackingId or bulkId', () => {
    const params = {
      includeHistory
    }

    const { error } = getReceiptMovementSchema.validate(params)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"GetReceiptMovement" must contain at least one of [wasteTrackingId, bulkId]'
    )
  })

  it('should reject when given includeHistory and not wasteTrackingId', () => {
    const params = {
      bulkId,
      includeHistory
    }

    const { error } = getReceiptMovementSchema.validate(params)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"includeHistory" missing required peer "wasteTrackingId"'
    )
  })

  it('should reject when wasteTrackingId and bulkId are null', () => {
    const params = {
      wasteTrackingId: null,
      bulkId: null,
      includeHistory
    }

    const { error } = getReceiptMovementSchema.validate(params)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"wasteTrackingId" must be a string')
  })

  it('should reject when includeHistory is null', () => {
    const params = {
      wasteTrackingId,
      includeHistory: null
    }

    const { error } = getReceiptMovementSchema.validate(params)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"includeHistory" must be a boolean')
  })

  it('should reject when wasteTrackingId is not a string', () => {
    const params = {
      wasteTrackingId: 123
    }

    const { error } = getReceiptMovementSchema.validate(params)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"wasteTrackingId" must be a string')
  })

  it('should reject when bulkId is not a string', () => {
    const params = {
      bulkId: 123
    }

    const { error } = getReceiptMovementSchema.validate(params)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"bulkId" must be a string')
  })

  it('should reject when includeHistory is not a boolean', () => {
    const params = {
      wasteTrackingId,
      includeHistory: 'yes'
    }

    const { error } = getReceiptMovementSchema.validate(params)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"includeHistory" must be a boolean')
  })
})
