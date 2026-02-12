import Joi from 'joi'
import { receiveMovementRequestSchema } from './receipt.js'

export const bulkReceiveMovementRequestSchema = Joi.array()
  .items(
    receiveMovementRequestSchema.append({
      apiCode: Joi.forbidden(),
      submittingOrganisation: Joi.object({
        defraCustomerOrganisationId: Joi.string().required()
      }).required()
    })
  )
  .min(1)
  .required()
  .label('BulkReceiveMovementRequest')
