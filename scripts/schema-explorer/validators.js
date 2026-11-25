// Compiles one version's JSON Schemas into standalone validation code for the
// explorer's "Try it" view, so the page checks a body exactly as the API does:
// same ajv, same options, same formats, same schema keys. Keep the options in
// step with src/schemas/validate/index.js.

import fs from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import standaloneCode from 'ajv/dist/standalone/index.js'

const collectSchemaFiles = (dir, root = dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return collectSchemaFiles(full, root)
    return entry.name.endsWith('.schema.json')
      ? [path.relative(root, full).split(path.sep).join('/')]
      : []
  })

/**
 * @param {string} schemaDir one version's folder, e.g. src/schemas/beta-2
 * @returns {{ code: string, ids: Record<string, string>, check: (file: string, value: unknown) => object[] | null }}
 *   CommonJS code that exports one validate function per schema file; each
 *   file's export name (keyed by its path relative to schemaDir, as the model's
 *   `file`s are); and check(), which returns a value's errors against a file's
 *   schema, or null when it is valid
 */
export const buildValidators = (schemaDir) => {
  // Registered as "<version>/<file>", like the API, so relative $refs resolve
  // the same way.
  const version = path.basename(schemaDir)
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
    // Errors carry the parentSchema that raised them; a conditional rule's
    // description becomes its message, as in hapi-validator.js.
    verbose: true,
    code: { source: true }
  })
  addFormats(ajv, ['date-time', 'email', 'uuid'])

  const files = collectSchemaFiles(schemaDir)
  for (const file of files) {
    ajv.addSchema(
      JSON.parse(fs.readFileSync(path.join(schemaDir, file), 'utf8')),
      `${version}/${file}`
    )
  }

  const ids = Object.fromEntries(files.map((file, i) => [file, `v${i}`]))
  const code = standaloneCode(
    ajv,
    Object.fromEntries(files.map((file, i) => [`v${i}`, `${version}/${file}`]))
  )
  const check = (file, value) => {
    const validate = ajv.getSchema(`${version}/${file}`)
    if (!validate) throw new Error(`No schema ${version}/${file}`)
    return validate(value) ? null : validate.errors
  }
  return { code, ids, check }
}
