import Joi from 'joi'
import { productionApprovalTestScenarioIds } from '../common/constants/production-approval-tests.js'

export const productionApprovalTestsSchema = Joi.array()
  .items(
    Joi.object({
      scenarioId: Joi.string()
        .valid(...productionApprovalTestScenarioIds)
        .required(),
      wasteTrackingId: Joi.string().required()
    })
  )
  .min(1)
  .unique((a, b) => a.scenarioId === b.scenarioId)
  .required()
  .messages({
    // Custom message rather than the default so it can be made more helpful by adding 'scenarioId'
    'array.unique': '{:#label} contains a duplicate scenarioId value'
  })
  .label('ProductionApprovalTestRequest')
