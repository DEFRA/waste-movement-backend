import { createTestPayload } from '../schemas/test-helpers/waste-test-helpers.js'
import { movementSchema } from './movement.js'

describe('movementSchema', () => {
  it('should accept valid payload with submittingOrganisation which has valid fields', () => {
    const payload = {
      submittingOrganisation: {
        defraCustomerOrganisationId: 'org-id-123'
      },
      movement: createTestPayload()
    }

    const { error } = movementSchema.validate(payload)

    expect(error).toBeUndefined()
  })

  it('should accept valid payload with submittingOrganisation which has unknown fields', () => {
    const payload = {
      submittingOrganisation: {
        defraCustomerOrganisationId: 'org-id-123',
        unknownField: 'unknown-field-value'
      },
      movement: createTestPayload()
    }

    const { error } = movementSchema.validate(payload)

    expect(error).toBeUndefined()
  })

  it('should accept valid payload without submittingOrganisation', () => {
    const payload = {
      movement: createTestPayload()
    }

    const { error } = movementSchema.validate(payload)

    expect(error).toBeUndefined()
  })

  it('should return an error when movement is missing', () => {
    const payload = {
      movement: undefined
    }

    const { error } = movementSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual('"ReceiveMovementRequest" is required')
  })

  it('should return an error when movement is null', () => {
    const payload = {
      movement: null
    }

    const { error } = movementSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"ReceiveMovementRequest" must be of type object'
    )
  })

  it('should return an error when defraCustomerOrganisationId is missing', () => {
    const payload = {
      submittingOrganisation: {
        defraCustomerOrganisationId: undefined
      },
      movement: createTestPayload()
    }

    const { error } = movementSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"submittingOrganisation.defraCustomerOrganisationId" is required'
    )
  })

  it('should return an error when defraCustomerOrganisationId is null', () => {
    const payload = {
      submittingOrganisation: {
        defraCustomerOrganisationId: null
      },
      movement: createTestPayload()
    }

    const { error } = movementSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"submittingOrganisation.defraCustomerOrganisationId" must be a string'
    )
  })

  it('should return an error when defraCustomerOrganisationId is not a string', () => {
    const payload = {
      submittingOrganisation: {
        defraCustomerOrganisationId: 123
      },
      movement: createTestPayload()
    }

    const { error } = movementSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"submittingOrganisation.defraCustomerOrganisationId" must be a string'
    )
  })

  it('should return an error when defraCustomerOrganisationId is an empty string', () => {
    const payload = {
      submittingOrganisation: {
        defraCustomerOrganisationId: ''
      },
      movement: createTestPayload()
    }

    const { error } = movementSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"submittingOrganisation.defraCustomerOrganisationId" is not allowed to be empty'
    )
  })
})
