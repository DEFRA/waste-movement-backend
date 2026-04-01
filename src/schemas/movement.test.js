import { createTestPayload } from '../schemas/test-helpers/waste-test-helpers.js'
import { movementSchema } from './movement.js'

describe('movementSchema', () => {
  it('should accept valid payload with submittingOrganisation inside movement', () => {
    const payload = {
      movement: {
        ...createTestPayload(),
        submittingOrganisation: {
          defraCustomerOrganisationId: 'org-id-123'
        }
      }
    }
    delete payload.movement.apiCode

    const { error } = movementSchema.validate(payload)

    expect(error).toBeUndefined()
  })

  it('should accept valid payload with apiCode inside movement', () => {
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
      movement: {
        ...createTestPayload(),
        apiCode: undefined,
        submittingOrganisation: {
          defraCustomerOrganisationId: undefined
        }
      }
    }

    const { error } = movementSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"movement.submittingOrganisation.defraCustomerOrganisationId" is required'
    )
  })

  it('should return an error when defraCustomerOrganisationId is null', () => {
    const payload = {
      movement: {
        ...createTestPayload(),
        apiCode: undefined,
        submittingOrganisation: {
          defraCustomerOrganisationId: null
        }
      }
    }

    const { error } = movementSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"movement.submittingOrganisation.defraCustomerOrganisationId" must be a string'
    )
  })

  it('should return an error when defraCustomerOrganisationId is not a string', () => {
    const payload = {
      movement: {
        ...createTestPayload(),
        apiCode: undefined,
        submittingOrganisation: {
          defraCustomerOrganisationId: 123
        }
      }
    }

    const { error } = movementSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"movement.submittingOrganisation.defraCustomerOrganisationId" must be a string'
    )
  })

  it('should return an error when defraCustomerOrganisationId is an empty string', () => {
    const payload = {
      movement: {
        ...createTestPayload(),
        apiCode: undefined,
        submittingOrganisation: {
          defraCustomerOrganisationId: ''
        }
      }
    }

    const { error } = movementSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toEqual(
      '"movement.submittingOrganisation.defraCustomerOrganisationId" is not allowed to be empty'
    )
  })

  it('should reject submittingOrganisation at root level', () => {
    const payload = {
      submittingOrganisation: {
        defraCustomerOrganisationId: 'org-id-123'
      },
      movement: createTestPayload()
    }

    const { error } = movementSchema.validate(payload)

    expect(error).toBeDefined()
    expect(error.message).toContain('"submittingOrganisation" is not allowed')
  })
})
