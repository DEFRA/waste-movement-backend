import Joi from 'joi'
import { receiveMovementRequestSchema } from './receipt.js'

const submittingOrganisationSchema = Joi.object({
  defraCustomerOrganisationId: Joi.string().required()
}).unknown(true)

export const movementSchema = Joi.object({
  movement: receiveMovementRequestSchema.required(),
  submittingOrganisation: submittingOrganisationSchema.optional()
}).label('Movement')
