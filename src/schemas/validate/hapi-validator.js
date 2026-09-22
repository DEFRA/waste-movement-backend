import Boom from '@hapi/boom'
import { ERROR_TYPE } from '@defra/waste-movement-utils'
import { getErrors, validate } from './index.js'

// Maps an AJV keyword to the shared ERROR_TYPE category for the response.
function toErrorType(error) {
  switch (error.keyword) {
    case 'required':
      return ERROR_TYPE.NOT_PROVIDED
    case 'additionalProperties':
    case 'propertyNames':
      return ERROR_TYPE.NOT_ALLOWED
    case 'type':
      return ERROR_TYPE.INVALID_TYPE
    case 'format':
    case 'pattern':
      return ERROR_TYPE.INVALID_FORMAT
    case 'enum':
    case 'const':
      return ERROR_TYPE.INVALID_VALUE
    case 'minLength':
    case 'maxLength':
    case 'minItems':
    case 'maxItems':
    case 'minimum':
    case 'maximum':
      return ERROR_TYPE.OUT_OF_RANGE
    default:
      return ERROR_TYPE.UNEXPECTED_ERROR
  }
}

function toPath(error) {
  const segments = error.instancePath.split('/').filter(Boolean)
  if (error.keyword === 'required') {
    return [...segments, error.params.missingProperty]
  }
  if (error.keyword === 'additionalProperties') {
    return [...segments, error.params.additionalProperty]
  }
  return segments
}

function toMessage(error) {
  return error.keyword === 'required'
    ? `"${error.params.missingProperty}" is required`
    : error.message
}

function toDetail(error) {
  return {
    message: toMessage(error),
    path: toPath(error),
    type: toErrorType(error)
  }
}

export const jsonSchemaValidator = (schemaId) => (value) => {
  if (validate(schemaId, value)) {
    return value
  }
  const details = getErrors(schemaId).map(toDetail)
  const boomError = Boom.badRequest(details.map((d) => d.message).join('. '))
  boomError.details = details
  throw boomError
}
