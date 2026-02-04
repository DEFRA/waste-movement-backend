import Joi from 'joi'

const submittingOrganisationSchema = Joi.object({
  defraCustomerOrganisationId: Joi.string().required().min(1)
}).unknown(true)

export const movementSchema = Joi.object({
  movement: Joi.object().required(),
  submittingOrganisation: submittingOrganisationSchema.optional()
}).label('Movement')
