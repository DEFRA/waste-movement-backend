import Boom from '@hapi/boom'
import { ERROR_TYPE } from '@defra/waste-movement-utils'
import { getErrors, validate } from './index.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()

// Maps an AJV keyword to the shared ERROR_TYPE category for the response.
function toErrorType(error) {
  switch (error.keyword) {
    case 'required':
      return ERROR_TYPE.NOT_PROVIDED
    // 'not' comes from a `{ "not": {} }` subschema — how a oneOf branch
    // forbids a property that the other branch requires (producer's
    // authorisationNumber/reason pair, brokerOrDealer's items when isPresent
    // is false). The property is present but not permitted, so it maps like
    // an extra property rather than falling through to UnexpectedError.
    // (Not a boolean `false` subschema: see conventions.test.js.)
    case 'additionalProperties':
    case 'propertyNames':
    case 'not':
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

export const jsonSchemaRequestValidator = (schemaId) => (value) => {
  if (validate(schemaId, value)) {
    return value
  }
  const details = getErrors(schemaId).map(toDetail)
  const boomError = Boom.badRequest(details.map((d) => d.message).join('. '))
  boomError.details = details
  throw boomError
}

export const jsonSchemaRequestValidatorFor = (version) => (name) =>
  jsonSchemaRequestValidator(`${version}/${name}.schema.json`)

// For `options.response.status[...]`. A mismatch is our bug, not the
// caller's: Hapi turns the throw into a generic 500, so the ajv errors are
// logged here (Hapi's own request log doesn't reliably reach pino) and never
// sent to the client.
export const jsonSchemaResponseValidator = (schemaId) => (value) => {
  if (validate(schemaId, value)) {
    return value
  }
  const errors = getErrors(schemaId)
  logger.error({ schemaId, errors }, 'Response failed schema validation')
  throw new Error(`Response does not match ${schemaId}`)
}

export const jsonSchemaResponseValidatorFor = (version) => (name) =>
  jsonSchemaResponseValidator(`${version}/${name}.schema.json`)
