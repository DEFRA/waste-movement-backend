import Joi from 'joi'
import { productionApprovalTestScenarioIds } from '../common/constants/production-approval-tests.js'
import { PRODUCTION_APPROVAL_TEST_ERRORS } from '../common/constants/validation-error-messages.js'

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
  .custom(validateUniqueScenarioIds)
  .required()
  .messages({
    'InvalidValue.scenarioIdUnique':
      PRODUCTION_APPROVAL_TEST_ERRORS.SCENARIO_ID_UNIQUE
  })
  .label('ProductionApprovalTestRequest')

/**
 * Validates the request scenarioId values are unique.
 *
 * Custom validator rather than using array.unique so that the error response
 * key and message are consistant with other errors.
 *
 * @param {[Object]} value - The request payload
 * @param {Object} helpers - The collections in which to find the waste inputs
 *
 * @returns {[Object] | Object} The request payload if valid, otherwise an error object
 */
function validateUniqueScenarioIds(value, helpers) {
  const uniqueScenarioIds = new Set(value.map(({ scenarioId }) => scenarioId))
  return uniqueScenarioIds.size === value.length
    ? value
    : helpers.error('InvalidValue.scenarioIdUnique')
}
