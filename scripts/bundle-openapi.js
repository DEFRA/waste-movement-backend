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

const [source, target] = process.argv.slice(2)

if (!source || !target) {
  console.error(
    'Usage: node scripts/bundle-openapi.js <source openapi.json> <target file>'
  )
  process.exit(1)
}

try {
  const bundled = await $RefParser.dereference(source, {
    dereference: { circular: false }
  })

  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(bundled, null, 2))
  console.log(`✓ ${source} → ${target}`)
} catch (err) {
  console.error(`✗ ${source}: ${err.message}`)
  process.exit(1)
}
