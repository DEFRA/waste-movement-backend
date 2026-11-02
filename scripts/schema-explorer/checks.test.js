// Checks the "Try it" view reports exactly what each beta route does with a
// request body: the schema's errors, then the route's own payload checks
// (withPayloadChecks: reference data, rules across fields, date-times).
//
// It runs every beta route's real `options.validate.payload` and the page's
// path (the compiled validators, errors.js and the checks bundle, as the page
// runs them) on each example and every way of breaking each field, plus values
// only the checks reject: unrecognised EWC codes, future date-times. A route
// missing from checks/routes.js, or one whose checks change, fails here.
//
// Run with `npm run test:schema-explorer`.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { buildValidators } from './validators.js'
import { toDetails, fromDetails } from './errors.js'
import { buildChecksBundle } from './checks/bundle.js'
import { routes } from './checks/routes.js'
import { casesFrom } from './test-cases.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const schemasRoot = path.resolve(here, '../../src/schemas')
const routesRoot = path.resolve(here, '../../src/routes')
const require = createRequire(import.meta.url)

// The bundle as the page runs it: a script that sets window.schemaChecks.
const window = {}
// eslint-disable-next-line no-new-func
new Function('window', 'self', await buildChecksBundle())(window, window)

const versions = fs
  .readdirSync(routesRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^beta-\d+$/.test(e.name))
  .map((e) => e.name)

// Every route object a version's route modules export.
const routeModules = async (version) => {
  const dir = path.join(routesRoot, version)
  const modules = await Promise.all(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
      .map((f) => import(path.join(dir, f)))
  )
  return modules
    .flatMap((m) => Object.values(m))
    .filter((r) => r?.method && r?.path && r?.options?.validate?.payload)
}

const loadValidators = (code) => {
  const exports = {}
  // eslint-disable-next-line no-new-func
  new Function('require', 'exports', code)(require, exports)
  return exports
}

// What the route returns as `errors` in its 400 response, or null when valid.
const routeErrors = (route, payload) => {
  try {
    route.options.validate.payload(payload)
    return null
  } catch (err) {
    if (!err.details) throw err
    return fromDetails(err.details)
  }
}

const readJson = (file) =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null

const examplesFor = (dir, file) => {
  const named = readJson(
    path.join(dir, file.replace(/\.schema\.json$/, '.examples.json'))
  )
  const own = readJson(path.join(dir, file)).examples ?? []
  const values = [...Object.values(named ?? {}).map((ex) => ex.value), ...own]
  return values.length ? values : [{}]
}

// Every string in a value that matches `test`, by its path.
const stringsIn = (value, test, at = []) =>
  typeof value === 'string'
    ? test(value)
      ? [at]
      : []
    : value && typeof value === 'object'
      ? Object.entries(value).flatMap(([k, v]) =>
          stringsIn(v, test, [...at, Array.isArray(value) ? Number(k) : k])
        )
      : []

const withValue = (value, at, change) => {
  const copy = structuredClone(value)
  at.slice(0, -1).reduce((node, key) => node[key], copy)[at.at(-1)] = change
  return copy
}

// Values the schema accepts but a check may not.
const checkCases = (example) => [
  ...stringsIn(example, (s) => /^\d{6}$/.test(s)).map((at) => [
    `/${at.join('/')} as an unrecognised EWC code`,
    withValue(example, at, '999999')
  ]),
  ...stringsIn(
    example,
    (s) => !Number.isNaN(Date.parse(s)) && /T/.test(s)
  ).flatMap((at) => [
    [
      `/${at.join('/')} in the future`,
      withValue(example, at, '2999-01-01T00:00:00Z')
    ],
    [
      `/${at.join('/')} a minute ago`,
      withValue(example, at, new Date(Date.now() - 60000).toISOString())
    ]
  ])
]

for (const version of versions) {
  const dir = path.join(schemasRoot, version)
  const { code, ids } = buildValidators(dir)
  const validators = loadValidators(code)
  const listed = routes[version] ?? []

  describe(`schema explorer checks match the routes (${version})`, async () => {
    for (const route of await routeModules(version)) {
      const name = `${route.method} ${route.path}`
      test(name, () => {
        const entry = listed.find(
          (r) => r.method === route.method && r.path === route.path
        )
        assert.ok(entry, `${version} ${name} is missing from checks/routes.js`)
        const validate = validators[ids[entry.file]]
        assert.ok(validate, `${version} has no schema ${entry.file}`)

        // As the page does it.
        const explorerErrors = (payload) => {
          const details = window.schemaChecks.runChecks(
            version,
            entry.file,
            payload,
            validate(payload) ? [] : toDetails(validate.errors)
          )
          return details.length ? fromDetails(details) : null
        }

        let checked = 0
        for (const example of examplesFor(dir, entry.file)) {
          for (const [label, payload] of [
            ...casesFrom(example),
            ...checkCases(example)
          ]) {
            assert.deepEqual(
              explorerErrors(payload),
              routeErrors(route, payload),
              `${entry.file}: ${label}`
            )
            checked++
          }
        }
        assert.ok(checked > 0)
      })
    }
  })
}
