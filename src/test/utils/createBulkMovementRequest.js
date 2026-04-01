import { createMovementRequest } from './createMovementRequest.js'

export function createBulkMovementRequest(overrides) {
  const movementRequest = createMovementRequest()
  delete movementRequest.apiCode

  const bulkMovementRequest = {
    submittingOrganisation: {
      defraCustomerOrganisationId: 'fd98d4ef34e33b34fc8fad03f8c385'
    }
  }

  return {
    ...movementRequest,
    ...bulkMovementRequest,
    ...overrides
  }
}
