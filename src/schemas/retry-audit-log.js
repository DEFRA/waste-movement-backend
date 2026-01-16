import Joi from 'joi'

export const retryAuditLogSchema = Joi.object({
  traceId: Joi.string().strict().empty(''),
  wasteTrackingId: Joi.string().strict().empty(''),
  revision: Joi.number().strict().empty('').positive()
})
  .xor('traceId', 'wasteTrackingId')
  .and('wasteTrackingId', 'revision')
  .required()
  .label('retryAuditLogSchema')
