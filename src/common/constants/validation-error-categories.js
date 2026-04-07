export const JOI_TYPE_TO_CATEGORY = {
  // NotProvided
  'any.required': 'NotProvided',
  'object.missing': 'NotProvided',
  'object.with': 'NotProvided',

  // NotAllowed
  'object.unknown': 'NotAllowed',
  'any.unknown': 'NotAllowed',

  // InvalidType
  'string.base': 'InvalidType',
  'number.base': 'InvalidType',
  'boolean.base': 'InvalidType',
  'array.base': 'InvalidType',
  'object.base': 'InvalidType',
  'date.base': 'InvalidType',

  // InvalidFormat
  'string.email': 'InvalidFormat',
  'string.uuid': 'InvalidFormat',
  'string.guid': 'InvalidFormat',
  'string.pattern.base': 'InvalidFormat',
  'date.format': 'InvalidFormat',
  'alternatives.match': 'InvalidFormat',

  // InvalidValue
  'any.only': 'InvalidValue',
  'any.invalid': 'InvalidValue',
  'string.empty': 'InvalidValue',

  // OutOfRange
  'string.min': 'OutOfRange',
  'string.max': 'OutOfRange',
  'number.min': 'OutOfRange',
  'number.max': 'OutOfRange',
  'number.positive': 'OutOfRange',
  'number.negative': 'OutOfRange',
  'number.integer': 'OutOfRange',
  'array.min': 'OutOfRange',
  'array.max': 'OutOfRange'
}

export const ERROR_CATEGORIES = [
  'InvalidType',
  'InvalidFormat',
  'InvalidValue',
  'OutOfRange',
  'BusinessRuleViolation'
]

export function getErrorCategory(joiErrorType) {
  if (JOI_TYPE_TO_CATEGORY[joiErrorType]) {
    return JOI_TYPE_TO_CATEGORY[joiErrorType]
  }

  // Check for custom error types with category prefix (e.g., 'InvalidFormat.ewcCode')
  for (const prefix of ERROR_CATEGORIES) {
    if (joiErrorType.startsWith(`${prefix}.`)) {
      return prefix
    }
  }

  return 'UnexpectedError'
}
