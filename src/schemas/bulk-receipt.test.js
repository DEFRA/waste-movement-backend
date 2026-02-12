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

  it('should return an error when the payload is missing submittingOrgansiation', () => {
    const payload = [
      {
        ...createBulkMovementRequest(),
        submittingOrganisation: undefined
      }
    ]
    const { error } = bulkReceiveMovementRequestSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"[0].submittingOrganisation" is required')
  })

  it('should return an error when the payload is missing defraCustomerOrganisationId', () => {
    const payload = [
      {
        ...createBulkMovementRequest(),
        submittingOrganisation: {}
      }
    ]
    const { error } = bulkReceiveMovementRequestSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"[0].submittingOrganisation.defraCustomerOrganisationId" is required'
    )
  })

  it('should return an error when the payload contains apiCode', () => {
    const payload = [
      {
        ...createBulkMovementRequest(),
        apiCode: '59c0780a-30a1-48e0-ab3f-39531045aefb'
      }
    ]
    const { error } = bulkReceiveMovementRequestSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"[0].apiCode" is not allowed')
  })
})
