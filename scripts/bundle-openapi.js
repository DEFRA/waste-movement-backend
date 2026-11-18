// Bundles an OpenAPI spec and every JSON Schema / example file it `$ref`s into
// a single self-contained JSON file. Usage:
//   node scripts/bundle-openapi.js <source openapi.json> <target file>
//
// Same approach as digital-waste-tracking-api-docs' scripts/bundle-specs.js:
// the spec is fully dereferenced, so every `$ref` is replaced by its target
// and none are left in the output. `circular: false` makes a self-referencing
// schema an error rather than a silent `$ref` left behind.
//
// Used before Schemathesis runs (test/schemathesis/run.sh): its coverage
// report (TraceCov) doesn't follow `$ref`s into other files, so against the
// split spec it only sees the path parameters' rules.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { $RefParser } from '@apidevtools/json-schema-ref-parser'

// Keywords that only describe a schema and never constrain it
const ANNOTATIONS = new Set([
  '$comment',
  'title',
  'description',
  'examples',
  'default',
  'deprecated',
  'readOnly',
  'writeOnly'
])

// In JSON Schema 2020-12 a `$ref`'s sibling keywords apply alongside its
// target (e.g. a request narrowing `items` of a shared waste-items schema).
// The dereferencer instead shallow-merges them over the target, so a sibling
// `items` would silently replace the target's `items`. Moving the `$ref` into
// an `allOf` keeps both. Annotation-only siblings are left alone: overriding
// those is harmless.
const preserveRefSiblings = (node) => {
  if (Array.isArray(node)) {
    return node.map(preserveRefSiblings)
  }
  if (node === null || typeof node !== 'object') {
    return node
  }

  const { $ref, ...rest } = node
  const siblings = Object.fromEntries(
    Object.entries(rest).map(([key, value]) => [
      key,
      preserveRefSiblings(value)
    ])
  )

  if (typeof $ref !== 'string') {
    return $ref === undefined ? siblings : { $ref, ...siblings }
  }
  if (Object.keys(siblings).every((key) => ANNOTATIONS.has(key))) {
    return { $ref, ...siblings }
  }
  return { ...siblings, allOf: [{ $ref }, ...(siblings.allOf ?? [])] }
}

const [source, target] = process.argv.slice(2)

if (!source || !target) {
  console.error(
    'Usage: node scripts/bundle-openapi.js <source openapi.json> <target file>'
  )
  process.exit(1)
}

try {
  const bundled = await $RefParser.dereference(source, {
    dereference: { circular: false },
    parse: {
      json: {
        parse: (file) => preserveRefSiblings(JSON.parse(file.data.toString()))
      }
    }
  })

  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(bundled, null, 2))
  console.log(`✓ ${source} → ${target}`)
} catch (err) {
  console.error(`✗ ${source}: ${err.message}`)
  process.exit(1)
}
