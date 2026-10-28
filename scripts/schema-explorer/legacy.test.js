// Checks the legacy page's "Try it" bundle reports exactly what the legacy
// routes' own code does. The page runs legacy/check.js bundled by esbuild, with
// Joi's browser build, the utils package reduced to the modules it uses, and
// src/config.js replaced by its values; this runs the same check unbundled, in
// Node, against the real modules, and requires identical results for every
// example and every way of breaking each field.
//
// Run with `npm run test:schema-explorer`.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLegacyBundle } from './legacy/bundle.js'
import { check } from './legacy/check.js'
import { buildLegacyModel } from './legacy/joi-model.js'
import { casesFrom } from './test-cases.js'

// The bundle as the page runs it: a script that sets window.legacyCheck.
const window = {}
// eslint-disable-next-line no-new-func
new Function('window', 'self', await buildLegacyBundle())(window, window)

const model = buildLegacyModel()
const targets = [
  ...model.roots.map((r) => [
    r.file,
    Object.values(r.examples).map((e) => e.value)
  ]),
  ...model.fragments.map((f) => [f.file, f.examples.length ? f.examples : [{}]])
]

describe('legacy Try it matches the routes', () => {
  for (const [file, examples] of targets) {
    test(file, () => {
      let checked = 0
      for (const example of examples) {
        for (const [label, payload] of casesFrom(example)) {
          assert.deepEqual(
            window.legacyCheck(file, payload),
            check(file, payload),
            `${file}: ${label}`
          )
          checked++
        }
      }
      assert.ok(checked > 0)
    })
  }
})
