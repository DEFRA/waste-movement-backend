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
    // Only reached when withoutCompositionSummaries found nothing more
    // specific to report in their place: a rule across fields was broken.
    case 'if':
    case 'oneOf':
    case 'anyOf':
      return ERROR_TYPE.BUSINESS_RULE_VIOLATION
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

const isAtOrBelow = (path, ancestor) =>
  ancestor.every((segment, i) => path[i] === segment)

const compositionKeywords = new Set(['if', 'oneOf', 'anyOf'])
const isSpecific = (error) => !compositionKeywords.has(error.keyword)

// The predicates below are `.filter` callbacks that use its third argument,
// the whole array, to compare each entry with the others.

// A failed if/then/else, oneOf or anyOf is reported twice: once by the
// branch's own keywords ("vehicleRegistration" is required) and once as a
// summary on the parent ('must match "then" schema'). The summary says
// nothing the caller can act on, so drop it whenever a more specific error
// sits at or below it.
const isNotCompositionSummary = (summary, _, errors) =>
  isSpecific(summary) ||
  !errors.some(
    (error) =>
      isSpecific(error) &&
      (error.instancePath === summary.instancePath ||
        error.instancePath.startsWith(`${summary.instancePath}/`))
  )

// With allErrors, ajv reports a value of the wrong type once for every oneOf
// branch (and nested schema) that checks it, plus each oneOf's own failure.
// Report it once, with nothing else at or below it — the caller has to fix
// the type before anything inside it can be checked.
const isNotBelowWrongType = (detail, _, details) =>
  details
    .filter((d) => d.type === ERROR_TYPE.INVALID_TYPE)
    .every(
      (wrongType) =>
        !isAtOrBelow(detail.path, wrongType.path) ||
        (detail.type === ERROR_TYPE.INVALID_TYPE &&
          detail.path.length === wrongType.path.length)
    )

const isFirstOccurrence = (detail, index, details) =>
  details.findIndex((d) => JSON.stringify(d) === JSON.stringify(detail)) ===
  index

export const jsonSchemaRequestValidator = (schemaId) => (value) => {
  if (validate(schemaId, value)) {
    return value
  }
  const details = getErrors(schemaId)
    .filter((error, index, all) => isNotCompositionSummary(error, index, all))
    .map(toDetail)
    .filter((detail, index, all) => isNotBelowWrongType(detail, index, all))
    .filter((detail, index, all) => isFirstOccurrence(detail, index, all))
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
