// Rules every *.schema.json (and *.examples.json) under src/schemas/ must
// follow, checked across all files at once rather than per schema. See
// README.md for the reasoning.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { getErrors, validate } from './validate/index.js'

// `import.meta.dirname`, matching validate/index.js — see the note there.
const schemaRoot = import.meta.dirname

function collectFiles(dir, suffix) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      return collectFiles(fullPath, suffix)
    }
    return entry.endsWith(suffix) ? [fullPath] : []
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

const readAll = (suffix) =>
  collectFiles(schemaRoot, suffix).map((file) => [
    path.relative(schemaRoot, file),
    JSON.parse(readFileSync(file, 'utf8'))
  ])

const schemaFiles = readAll('.schema.json')
const examplesFiles = readAll('.examples.json')

// The validator's key for a file: its path from src/schemas/, "/"-separated.
const schemaIdFor = (file) =>
  file
    .replace(/\.examples\.json$/, '.schema.json')
    .split(path.sep)
    .join('/')

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
      const id = schemaIdFor(file)
      validate(id, example)
      expect(getErrors(id)).toBeNull()
    }
  )

  // Whole request and response bodies keep their examples in a sibling
  // <name>.examples.json, a map of named OpenAPI Example Objects, so the spec
  // can offer them by name (a picker in Swagger UI, saved examples in API
  // clients). Path params have no body, so they keep a root `examples`.
  const beta2Bodies = schemaFiles.filter(
    ([file]) =>
      file.startsWith(`beta-2${path.sep}`) &&
      /-(request|response)\.schema\.json$/.test(file)
  )
  const beta2Params = schemaFiles.filter(
    ([file]) =>
      file.startsWith(`beta-2${path.sep}`) &&
      file.endsWith('-params.schema.json')
  )
  const examplesByFile = new Map(examplesFiles)

  test.each(beta2Bodies)('%s has named examples beside it', (file) => {
    const examples = examplesByFile.get(
      file.replace(/\.schema\.json$/, '.examples.json')
    )
    expect(Object.keys(examples ?? {}).length).toBeGreaterThan(0)
  })

  test.each(beta2Params)('%s has at least one example', (_, schema) => {
    expect(schema.examples?.length).toBeGreaterThan(0)
  })

  const namedExamples = examplesFiles.flatMap(([file, examples]) =>
    Object.entries(examples).map(([name, example]) => [file, name, example])
  )

  test.each(namedExamples)(
    '%s example "%s" has a summary and a value valid against its schema',
    (file, _, example) => {
      expect(Object.keys(example).sort()).toEqual(['summary', 'value'])
      expect(typeof example.summary).toBe('string')

      const id = schemaIdFor(file)
      validate(id, example.value)
      expect(getErrors(id)).toBeNull()
    }
  )

  // Clients such as Bruno and Postman pair a request example with the
  // response example of the same name; unmatched names produce every
  // request × response combination instead.
  const requestExamples = examplesFiles.filter(([file]) =>
    file.endsWith('-request.examples.json')
  )

  test.each(requestExamples)(
    '%s names match its response examples',
    (file, examples) => {
      const response = examplesByFile.get(
        file.replace(/-request\.examples\.json$/, '-response.examples.json')
      )
      expect(Object.keys(response ?? {})).toEqual(Object.keys(examples))
    }
  )
})
