import Joi from 'joi'

// Loosely typing and not enforcing .strict() as this validation is for
// URL params where all values will be strings
export const getReceiptMovementSchema = Joi.object({
  wasteTrackingId: Joi.string(),
  bulkId: Joi.string(),
  includeHistory: Joi.boolean()
})
  .or('wasteTrackingId', 'bulkId') // Either wasteTrackingId or bulkId is required but also allow both
  .with('includeHistory', 'wasteTrackingId') // includeHistory requires wasteTrackingId
  .label('GetReceiptMovement')
