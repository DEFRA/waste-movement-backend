import Joi from 'joi'

// Generic schema for hazardous waste
// This can be extended with specific fields as requirements evolve
export const hazardousWasteSchema = Joi.object({
  // The schema is intentionally left open to accept any properties
  // as per the issue description which states:
  // "The hazardousWaste in the input is the entire request sent to the External API by the receiver"
})
  .unknown(true)
  .label('HazardousWaste')

// Schema for updating hazardous waste details in a receipt
export const updateHazardousWasteSchema = Joi.object({
  receipt: Joi.object({
    hazardousWaste: hazardousWasteSchema.required()
  }).required()
}).label('UpdateHazardousWaste')
