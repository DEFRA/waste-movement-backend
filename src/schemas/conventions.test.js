// Rules every *.schema.json under src/schemas/ must follow, checked across
// all files at once rather than per schema. See README.md for the reasoning.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { getErrors, validate } from './validate/index.js'

// `import.meta.dirname`, matching validate/index.js — see the note there.
const schemaRoot = import.meta.dirname

function collectSchemaFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      return collectSchemaFiles(fullPath)
    }
    return entry.endsWith('.schema.json') ? [fullPath] : []
  })
}

// Keywords whose value is a subschema, a map of them, or a list of them.
// `additionalProperties` is deliberately absent: `false` there is how a whole
// payload is closed, and every tool we know of handles it.
const subschemaKeywords = [
  'items',
  'contains',
  'propertyNames',
  'not',
  'if',
  'then',
  'else'
]
const subschemaMapKeywords = [
  'properties',
  'patternProperties',
  'dependentSchemas',
  '$defs'
]
const subschemaListKeywords = ['allOf', 'anyOf', 'oneOf', 'prefixItems']

/** JSON pointers to every `true` / `false` used in place of a subschema. */
function findBooleanSubschemas(node, pointer = '') {
  if (Array.isArray(node)) {
    return node.flatMap((v, i) => findBooleanSubschemas(v, `${pointer}/${i}`))
  }
  if (!node || typeof node !== 'object') {
    return []
  }

  const found = []
  const check = (value, at) => {
    if (typeof value === 'boolean') found.push(at)
  }
  for (const key of subschemaKeywords) {
    if (key in node) check(node[key], `${pointer}/${key}`)
  }
  for (const key of subschemaMapKeywords) {
    for (const [name, value] of Object.entries(node[key] ?? {})) {
      check(value, `${pointer}/${key}/${name}`)
    }
  }
  for (const key of subschemaListKeywords) {
    for (const [i, value] of (node[key] ?? []).entries()) {
      check(value, `${pointer}/${key}/${i}`)
    }
  }

  for (const [key, value] of Object.entries(node)) {
    found.push(...findBooleanSubschemas(value, `${pointer}/${key}`))
  }
  // A property *named* like a keyword (brokerOrDealer's `items`) is seen both
  // as a map entry and as a keyword when the map itself is walked.
  return [...new Set(found)]
}

const schemaFiles = collectSchemaFiles(schemaRoot).map((file) => [
  path.relative(schemaRoot, file),
  JSON.parse(readFileSync(file, 'utf8'))
])

describe('schema conventions', () => {
  test('finds schema files to check', () => {
    expect(schemaFiles.length).toBeGreaterThan(0)
  })

  // Boolean subschemas (`"field": false` to forbid a field) are valid JSON
  // Schema 2020-12 and OpenAPI 3.1, but tools built on OpenAPIKit — Apple's
  // swift-openapi-generator, OpenAPI Viewer for macOS — cannot decode them
  // and reject the whole published spec, which `$ref`s these files. Write
  // `{ "not": {}, "description": "Not allowed when …" }` instead: it
  // validates identically, and hapi-validator maps its 'not' error to
  // NotAllowed exactly as it did for 'false schema'.
  test.each(schemaFiles)('%s uses no boolean subschemas', (_, schema) => {
    expect(findBooleanSubschemas(schema)).toEqual([])
  })

  // ajv treats `examples` as an annotation and never checks it, so an example
  // that has drifted from its schema would be published in the spec unnoticed.
  const filesWithExamples = schemaFiles
    .filter(([, schema]) => schema.examples)
    .flatMap(([file, schema]) =>
      schema.examples.map((example, i) => [file, i, example])
    )

  test.each(filesWithExamples)(
    '%s example %i is valid against its own schema',
    (file, _, example) => {
      const id = file.split(path.sep).join('/')
      validate(id, example)
      expect(getErrors(id)).toBeNull()
    }
  )

  // Whole bodies are what the published spec renders a sample payload from.
  const beta2Bodies = schemaFiles.filter(
    ([file]) =>
      file.startsWith(`beta-2${path.sep}`) &&
      /-(request|response|params)\.schema\.json$/.test(file)
  )

  test.each(beta2Bodies)('%s has at least one example', (_, schema) => {
    expect(schema.examples?.length).toBeGreaterThan(0)
  })
})
