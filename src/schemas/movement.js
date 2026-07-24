import Joi from 'joi'
import { receiveMovementRequestSchema } from 'waste-movement-utils'

// `clientId` is the OAuth client identifier of the software provider that
// submitted the movement. The external API resolves it from the caller's JWT
// and injects it before forwarding, so it is not part of the shared customer
// input schema — it is accepted here on the internal backend contract only.
export const movementSchema = Joi.object({
  movement: receiveMovementRequestSchema
    .keys({
      clientId: Joi.string()
    })
    .required()
}).label('Movement')
