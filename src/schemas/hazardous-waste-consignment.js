import Joi from 'joi'
import { isValidHazardousEwcCode } from '../common/constants/ewc-codes.js'
import { CONSIGNMENT_ERRORS } from '../common/constants/validation-error-messages.js'
import {
  EA_NRW_CONSIGNMENT_CODE_REGEX,
  NIEA_CONSIGNMENT_CODE_REGEX,
  SEPA_CONSIGNMENT_CODE_REGEX
} from '../common/constants/regexes.js'

export function hasHazardousEwcCodes(payload) {
  // Access root payload to inspect waste EWC codes
  const root = payload
  const wasteArray = Array.isArray(root.wasteItems) ? root.wasteItems : []
  const allEwcCodes = wasteArray
    .flatMap((w) => (Array.isArray(w.ewcCodes) ? w.ewcCodes : []))
    .filter(Boolean)

  return allEwcCodes.some((code) => isValidHazardousEwcCode(code))
}

export const hazardousWasteConsignmentCodeSchema = Joi.custom(
  (value, helpers) => {
    const payload = helpers.state.ancestors[0]
    const hasHazardous = hasHazardousEwcCodes(payload)

    // If hazardous EWC codes are present and code is explicitly null, require it
    // If code is undefined, let reasonForNoConsignmentCode validation handle the requirement
    if (hasHazardous && value === null && !payload.reasonForNoConsignmentCode) {
      return helpers.error('BusinessRuleViolation.hazardousConsignmentRequired')
    }

    // Validate format if value is provided
    if (value) {
      const valid =
        EA_NRW_CONSIGNMENT_CODE_REGEX.test(value) ||
        SEPA_CONSIGNMENT_CODE_REGEX.test(value) ||
        NIEA_CONSIGNMENT_CODE_REGEX.test(value)
      if (!valid) {
        return helpers.error('InvalidFormat.consignmentCode')
      }
    }
    return value
  }
).messages({
  'InvalidFormat.consignmentCode': CONSIGNMENT_ERRORS.CODE_FORMAT,
  'BusinessRuleViolation.hazardousConsignmentRequired':
    CONSIGNMENT_ERRORS.CODE_REQUIRED
})
