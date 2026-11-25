// Checks that the explorer's "Try it" view reports exactly what the API would:
// the same errors, in the same order, with the same type, pointer and message.
//
// The explorer copies the API's validation rather than sharing it (its pages
// are static), so this catches drift in either half:
// - validators.js compiles the schemas with the same ajv options as
//   src/schemas/validate/index.js, and
// - errors.js reduces ajv's errors the way src/schemas/validate/hapi-validator.js
//   does.
//
// Every schema file in every version is checked, starting from its examples
// (named examples, the schema's own, and the explorer's in examples/) and then
// breaking each field in turn. Run with `npm run test:schema-explorer`.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { jsonSchemaRequestValidator } from '../../src/schemas/validate/hapi-validator.js'
import { buildValidators } from './validators.js'
import { toApiErrors } from './errors.js'
import { casesFrom } from './test-cases.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const schemasRoot = path.resolve(here, '../../src/schemas')
const require = createRequire(import.meta.url)

// The versions the explorer publishes: the beta-N folders, as in build.js.
const versions = fs
  .readdirSync(schemasRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^beta-\d+$/.test(e.name))
  .map((e) => e.name)

// Runs the generator's standalone validator code the way the page does.
const loadValidators = (code) => {
  const exports = {}
  // eslint-disable-next-line no-new-func
  new Function('require', 'exports', code)(require, exports)
  return exports
}

// What the API returns as `errors` in its 400 response, or null when valid.
const apiErrors = (schemaId, payload) => {
  try {
    jsonSchemaRequestValidator(schemaId)(payload)
    return null
  } catch (err) {
    if (!err.details) throw err
    return err.details.map((d) => ({
      message: d.message,
      pointer: '/' + d.path.join('/'),
      errorType: d.type
    }))
  }
}

const readJson = (file) =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null

const examplesFor = (dir, slug, file) => {
  const named = readJson(
    path.join(dir, file.replace(/\.schema\.json$/, '.examples.json'))
  )
  const own = readJson(path.join(dir, file)).examples ?? []
  const extra =
    readJson(path.join(here, 'examples', `${slug}.json`))?.[file] ?? []
  const values = [
    ...Object.values(named ?? {}).map((ex) => ex.value),
    ...own,
    ...extra
  ]
  return values.length ? values : [{}]
}

for (const slug of versions) {
  const dir = path.join(schemasRoot, slug)
  const { code, ids } = buildValidators(dir)
  const validators = loadValidators(code)

  describe(`schema explorer errors match the API (${slug})`, () => {
    for (const file of Object.keys(ids)) {
      test(file, () => {
        const validate = validators[ids[file]]
        const schemaId = `${slug}/${file}`
        let checked = 0
        for (const example of examplesFor(dir, slug, file)) {
          for (const [label, payload] of casesFrom(example)) {
            const explorer = validate(payload)
              ? null
              : toApiErrors(validate.errors)
            assert.deepEqual(
              explorer,
              apiErrors(schemaId, payload),
              `${file}: ${label}`
            )
            checked++
          }
        }
        assert.ok(checked > 0)
      })
    }
  })
}
