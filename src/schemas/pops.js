import Joi from 'joi'

// Generic schema for Proof of Processing (POPs)
// This can be extended with specific fields as requirements evolve
export const popsSchema = Joi.object({
  // The schema is intentionally left open to accept any properties
  // as per the issue description which states:
  // "The pops in the input is the entire request sent to the External API by the receiver"
})
  .unknown(true)
  .label('Pops')

// Schema for updating POPs details in a receipt
export const updatePopsSchema = Joi.object({
  receipt: Joi.object({
    pops: popsSchema.required()
  }).required()
}).label('UpdatePops')
