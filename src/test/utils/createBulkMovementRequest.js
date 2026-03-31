import { createMovementRequest } from './createMovementRequest.js'

export function createBulkMovementRequest(overrides) {
  return {
    ...createMovementRequest(),
    ...overrides
  }
}
