// Turns ajv's validation errors into the explorer's readable list: an error
// type, a pointer and a message each. It follows
// src/schemas/validate/hapi-validator.js (categories, messages and which errors
// are dropped), and errors.test.js fails if the two ever disagree.
//
// The generator inlines this file into each page (as window.schemaErrors), so
// it must stay self-contained: no imports, and plain code a browser can run.

const ERROR_TYPE_BY_KEYWORD = {
  required: 'NotProvided',
  additionalProperties: 'NotAllowed',
  propertyNames: 'NotAllowed',
  not: 'NotAllowed',
  type: 'InvalidType',
  format: 'InvalidFormat',
  pattern: 'InvalidFormat',
  enum: 'InvalidValue',
  const: 'InvalidValue',
  minLength: 'OutOfRange',
  maxLength: 'OutOfRange',
  minItems: 'OutOfRange',
  maxItems: 'OutOfRange',
  minimum: 'OutOfRange',
  maximum: 'OutOfRange',
  exclusiveMinimum: 'OutOfRange',
  exclusiveMaximum: 'OutOfRange',
  if: 'BusinessRuleViolation',
  oneOf: 'BusinessRuleViolation',
  anyOf: 'BusinessRuleViolation'
}

const composition = new Set(['if', 'oneOf', 'anyOf'])
const isSpecific = (e) => !composition.has(e.keyword)

const toPath = (e) => {
  const segments = e.instancePath.split('/').filter(Boolean)
  if (e.keyword === 'required') return [...segments, e.params.missingProperty]
  if (e.keyword === 'additionalProperties') {
    return [...segments, e.params.additionalProperty]
  }
  return segments
}

const isAtOrBelow = (path, ancestor) =>
  ancestor.every((segment, i) => path[i] === segment)

// A then/else branch or a `{ "not": {} }` only states a condition, and its
// description says it ("Required when …", "Not allowed when …").
const isCondition = ({ keyword, schemaPath }) =>
  keyword === 'not' || /\/(then|else)\/[^/]+$/.test(schemaPath)

// Field names and values go in single quotes in every message.
const quote = (value) => `'${value}'`

const toMessage = (e) => {
  if (isCondition(e)) return e.parentSchema.description
  switch (e.keyword) {
    case 'required':
      return `${quote(e.params.missingProperty)} is required`
    case 'enum':
      return `must be one of: ${e.params.allowedValues.map(quote).join(', ')}`
    case 'pattern':
      return `must match pattern ${quote(e.params.pattern)}`
    case 'format':
      return `must match format ${quote(e.params.format)}`
    default:
      return e.message
  }
}

/**
 * @param {object[]} ajvErrors errors from a validator compiled with `verbose`
 * @returns {{ errorType: string, pointer: string, message: string }[]}
 */
export const toApiErrors = (ajvErrors) =>
  ajvErrors
    // Drop an if / oneOf / anyOf summary when a more specific error explains it.
    .filter(
      (summary, _, all) =>
        isSpecific(summary) ||
        !all.some(
          (e) =>
            isSpecific(e) &&
            (e.instancePath === summary.instancePath ||
              e.instancePath.startsWith(summary.instancePath + '/'))
        )
    )
    .map((e) => ({
      message: toMessage(e),
      path: toPath(e),
      type: ERROR_TYPE_BY_KEYWORD[e.keyword] || 'UnexpectedError'
    }))
    // A value of the wrong type is reported once, with nothing below it.
    .filter((d, _, all) =>
      all
        .filter((w) => w.type === 'InvalidType')
        .every(
          (w) =>
            !isAtOrBelow(d.path, w.path) ||
            (d.type === 'InvalidType' && d.path.length === w.path.length)
        )
    )
    .filter(
      (d, i, all) =>
        all.findIndex((x) => JSON.stringify(x) === JSON.stringify(d)) === i
    )
    .map((d) => ({
      message: d.message,
      pointer: '/' + d.path.join('/'),
      errorType: d.type
    }))
