import Joi from 'joi'
import { WEIGHT_UNITS } from '../common/constants/weight-units.js'

export const weightSchema = Joi.object({
  metric: Joi.string()
    .valid(...WEIGHT_UNITS)
    .required(),
  amount: Joi.number().strict().required().positive(),
  isEstimate: Joi.bool().strict().required()
})
