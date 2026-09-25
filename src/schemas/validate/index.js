// Compiles every beta JSON Schema file under src/schemas/ with ajv, and
// exposes a single validate(id, payload) entry point keyed by each file's
// path relative to src/schemas/ (e.g.
// "beta-2/common/producer/producer.schema.json").
//
// The schema files themselves carry no $id. The key passed to addSchema
// becomes the schema's base URI, so relative $refs resolve against the
// file's own location — siblings (producer-base.schema.json) and
// cross-folder (../common/producer/producer.schema.json) alike. Leaving
// $id out also means the files stay correct when served over HTTP
// elsewhere, where the base URI falls back to the retrieval URL.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

// `import.meta.dirname`, not `__dirname`: this file runs as native ESM in
// production (package.json has "type": "module", no build step), where
// `__dirname` is not defined. Under Jest, babel-jest transpiles to
// CommonJS and `babel-plugin-transform-import-meta` (enabled only in the
// `test` env, see babel.config.cjs) rewrites `import.meta.dirname` to the
// module-wrapper-supplied `__dirname`, so the same source works both ways.
const schemaRoot = path.join(import.meta.dirname, '..')

function collectSchemaFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      return collectSchemaFiles(fullPath)
    }
    return entry.endsWith('.schema.json') ? [fullPath] : []
  })
}

const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv, ['email', 'uuid'])

for (const file of collectSchemaFiles(schemaRoot)) {
  const schema = JSON.parse(readFileSync(file, 'utf-8'))

  ajv.addSchema(schema, path.relative(schemaRoot, file))
}

/**
 * Validates `payload` against the schema registered under `id` — its path
 * relative to src/schemas/. Returns true/false, same as calling an
 * ajv-compiled validate function directly — use getErrors(id) after a
 * `false` result to see why.
 */
export function validate(id, payload) {
  const validateFn = ajv.getSchema(id)
  if (!validateFn) {
    throw new Error(`No schema registered under "${id}".`)
  }
  return validateFn(payload)
}

/**
 * The ajv validation errors from the most recent validate(id, ...) call
 * against that schema, or null if it last passed / hasn't run yet.
 */
export function getErrors(id) {
  return ajv.getSchema(id)?.errors ?? null
}

export { ajv }
