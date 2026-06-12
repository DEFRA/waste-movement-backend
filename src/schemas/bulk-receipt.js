import Joi from 'joi'
import { receiveMovementRequestSchema } from 'waste-movement-utils'
import { config } from '../config.js'

const bulkRecordLimit = config.get('bulk.recordLimit')

export const bulkReceiveMovementRequestSchema = Joi.array()
  .items(receiveMovementRequestSchema)
  .min(1)
  .max(bulkRecordLimit)
  .required()
  .label('BulkReceiveMovementRequest')

export const bulkUpdateMovementRequestSchema = Joi.array()
  .items(
    receiveMovementRequestSchema.keys({
      wasteTrackingId: Joi.string().required()
    })
  )
  .min(1)
  .max(bulkRecordLimit)
  .required()
  .label('BulkUpdateMovementRequest')
