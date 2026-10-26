import Boom from '@hapi/boom'
import { ERROR_TYPE } from '@defra/waste-movement-utils'

// The JSON Schema checks receiptDateTime is given and is an ISO 8601
// date-time. Whether it's in the future depends on when the request arrives,
// so it can't be said in a schema and is checked here instead.
const field = 'receiptDateTime'

const isAtField = (detail) =>
  detail.path.length === 1 && detail.path[0] === field

// The schema reports "" as not matching the date-time format, but "" means
// the time of receipt isn't provided, so it's reported as required instead.
export const replaceEmptyReceiptDateTime = (payload, details) =>
  payload?.[field] === ''
    ? [
        ...details.filter((detail) => !isAtField(detail)),
        {
          message: `'${field}' is required`,
          path: [field],
          type: ERROR_TYPE.NOT_PROVIDED
        }
      ]
    : details

// Only a value the schema accepted is checked: one it rejected has already
// been reported, and may not parse.
export const findFutureReceiptDateTime = (
  payload,
  details,
  now = Date.now()
) =>
  details.some(isAtField) ||
  typeof payload?.[field] !== 'string' ||
  Date.parse(payload[field]) <= now
    ? []
    : [
        {
          message: 'must not be in the future',
          path: [field],
          type: ERROR_TYPE.OUT_OF_RANGE
        }
      ]

// Wraps a receipt route's payload validator so these checks are reported
// alongside the schema's own errors, in the same shape.
export const withReceiptDateTimeChecks = (validatePayload) => (payload) => {
  let earlierDetails = []
  try {
    validatePayload(payload)
  } catch (error) {
    if (!Array.isArray(error.details)) {
      throw error
    }
    earlierDetails = error.details
  }

  const replaced = replaceEmptyReceiptDateTime(payload, earlierDetails)
  const details = [...replaced, ...findFutureReceiptDateTime(payload, replaced)]
  if (details.length === 0) {
    return payload
  }
  const boomError = Boom.badRequest(details.map((d) => d.message).join('. '))
  boomError.details = details
  throw boomError
}
