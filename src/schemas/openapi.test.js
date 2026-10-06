// Checks that each beta-*/openapi.json is valid together with everything it
// `$ref`s: the JSON Schemas beside it, the refs between those schemas, and
// the named `.examples.json` files. The OpenAPI schema only sees the document
// it's given, so the refs are resolved in memory first — a missing file or
// pointer, or a ref that loops back on itself, fails here, as does anything
// invalid it pulls in.
//
// test-helpers/openapi-3.1.json is the official OpenAPI 3.1 schema, copied
// verbatim from its `$id` URL. Like any OpenAPI-document validator, it checks
// the document's structure and leaves Schema Objects to ajv, which already
// compiles every *.schema.json in strict mode (validate/index.js).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

// `import.meta.dirname`, matching validate/index.js — see the note there.
const schemaRoot = import.meta.dirname

// ajv mis-resolves `$dynamicRef`, validating e.g. a header's `schema` as a
// whole Header Object. The OpenAPI schema's only dynamic anchor is `meta`, on
// `$defs/schema`, and nothing here extends the dialect, so a plain `$ref` to
// it is equivalent — the same substitution openapi-schema-validator ships.
const openApiSchema = JSON.parse(
  readFileSync(path.join(schemaRoot, 'test-helpers', 'openapi-3.1.json')),
  (_key, value) =>
    value?.$dynamicRef === '#meta' ? { $ref: '#/$defs/schema' } : value
)

// Discovered rather than listed, so a future beta-3 is covered with no change here.
const specs = readdirSync(schemaRoot)
  .filter((entry) => entry.startsWith('beta-'))
  .map((version) => `${version}/openapi.json`)
  .filter((spec) => existsSync(path.join(schemaRoot, spec)))

// Not strict: the OpenAPI schema uses keywords ajv's strict mode flags.
// `media-range` is an OpenAPI-defined format with no standard implementation.
const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
ajv.addFormat('media-range', true)
const validateOpenApi = ajv.compile(openApiSchema)

const readJson = (file) => JSON.parse(readFileSync(file, 'utf-8'))

/** The node at JSON pointer `pointer` ("" or "/a/b") in `doc`. */
function atPointer(doc, pointer, failure) {
  return pointer
    .split('/')
    .slice(1)
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((node, token) => {
      if (node?.[token] === undefined) {
        throw new Error(failure)
      }
      return node[token]
    }, doc)
}

/**
 * `node` with every `$ref` replaced by its target, recursively. Relative
 * refs resolve against the file they appear in; keywords beside a `$ref`
 * are kept on top of its target.
 */
function resolveRefs(node, file, trail = []) {
  if (Array.isArray(node)) {
    return node.map((item) => resolveRefs(item, file, trail))
  }
  if (!node || typeof node !== 'object') {
    return node
  }

  const { $ref, ...rest } = node
  const resolvedRest = Object.fromEntries(
    Object.entries(rest).map(([key, value]) => [
      key,
      resolveRefs(value, file, trail)
    ])
  )
  if (typeof $ref !== 'string') {
    return resolvedRest
  }

  const where = `$ref "${$ref}" in ${path.relative(schemaRoot, file)}`
  const [target, pointer = ''] = $ref.split('#')
  const targetFile = target ? path.resolve(path.dirname(file), target) : file
  const at = `${targetFile}#${pointer}`
  if (trail.includes(at)) {
    throw new Error(`Circular ${where}`)
  }
  if (!existsSync(targetFile)) {
    throw new Error(`Cannot resolve ${where}`)
  }

  const targetNode = atPointer(
    readJson(targetFile),
    pointer,
    `Cannot resolve ${where}`
  )
  return {
    ...resolveRefs(targetNode, targetFile, [...trail, at]),
    ...resolvedRest
  }
}

test('finds a spec for each beta version', () => {
  expect(specs).toEqual(['beta-1/openapi.json', 'beta-2/openapi.json'])
})

test.each(specs)(
  '%s is a valid OpenAPI 3.1 document with all its $refs resolved',
  (spec) => {
    const file = path.join(schemaRoot, spec)
    const resolved = resolveRefs(readJson(file), file)

    validateOpenApi(resolved)
    expect(validateOpenApi.errors).toBeNull()
  }
)
