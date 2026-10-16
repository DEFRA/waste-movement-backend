// Checks a payload against a legacy (Joi) schema the way the legacy routes do:
// Joi with abortEarly off (src/server.js), errors formatted by the API's own
// validationErrorFormatter, and per-item errors for bulk routes
// (src/plugins/error-handler.js). The legacy page's "Try it" runs this, bundled
// by esbuild; errors.test.js runs it in Node against the same modules.

import { validationErrorFormatter } from '@defra/waste-movement-utils'
import { formatBulkUploadValidationErrors } from '../../../src/plugins/error-handler.js'
import { fragments, roots } from './schemas.js'

// The formatter logs as it goes; the page has nowhere to log to.
const quiet = { error: () => {}, warn: () => {}, info: () => {} }

const schemaFor = (key) =>
  roots.find((r) => r.id === key || r.file === key) ??
  fragments.find((f) => f.file === key)

/**
 * @param {string} key a root's id or file, or a fragment's file
 * @param {unknown} payload
 * @returns {{ valid: boolean, body?: unknown, errors: { errorType: string, pointer: string, message: string, key: string }[] } | null}
 *   null when there is no such schema. `body` is what the route returns.
 */
export const check = (key, payload) => {
  const target = schemaFor(key)
  if (!target) return null
  const { error } = target.schema.validate(payload, { abortEarly: false })
  if (!error) return { valid: true, errors: [] }

  let body = validationErrorFormatter({ details: error.details }, quiet)
  const perItem = body.validation.errors.some((e) => /^\d+(\.|$)/.test(e.key))
  if (target.bulk && perItem) {
    body = formatBulkUploadValidationErrors(
      payload,
      body.validation.errors,
      quiet
    )
  }
  const errors = Array.isArray(body)
    ? body.flatMap((item) => item.validation?.errors ?? [])
    : body.validation.errors
  return {
    valid: false,
    body,
    errors: errors.map((e) => ({
      errorType: e.errorType,
      pointer: e.key ? '/' + e.key.split('.').join('/') : '/',
      message: e.message,
      key: e.key
    }))
  }
}
