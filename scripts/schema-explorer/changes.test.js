// Checks the "What's changed" comparison (changes.js) finds known edits: it
// copies a version's schemas, changes a shared fragment in a few ways, and
// compares the two builds. Run with `npm run test:schema-explorer`.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildModel } from './model.js'
import { compareModels, changesMarkdown } from './changes.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const beta2 = path.resolve(here, '../../src/schemas/beta-2')

// A copy of beta-2 with `edit` applied to one of its files.
const editedCopy = (file, edit) => {
  const dir = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'schema-explorer-changes-')),
    'beta-2'
  )
  fs.cpSync(beta2, dir, { recursive: true })
  const target = path.join(dir, file)
  const schema = JSON.parse(fs.readFileSync(target, 'utf8'))
  edit(schema)
  fs.writeFileSync(target, JSON.stringify(schema))
  return dir
}

const before = buildModel(beta2)

describe('schema explorer changes', () => {
  test('finds nothing when nothing changed', () => {
    const changes = compareModels(buildModel(beta2), buildModel(beta2), 'main')
    assert.deepEqual(changes.roots, [])
    assert.deepEqual(changes.fragments, [])
  })

  test('reports fields added, removed and changed in a fragment and where it is used', () => {
    const after = buildModel(
      editedCopy('common/carrier.schema.json', (s) => {
        s.properties.fleetNumber = { type: 'string', description: 'New.' }
        delete s.properties.address
        s.properties.vehicleRegistration.maxLength = 12
        s.required = s.required.filter((k) => k !== 'contactDetails')
      })
    )
    const changes = compareModels(before, after, 'main')

    const carrier = changes.fragments.find(
      (f) => f.file === 'common/carrier.schema.json'
    )
    assert.equal(carrier.status, 'changed')
    const byPath = Object.fromEntries(carrier.fields.map((f) => [f.path, f]))
    assert.equal(byPath.fleetNumber.status, 'added')
    // Removed with the address fields inside it, listed once.
    assert.equal(byPath.address.status, 'removed')
    assert.ok(byPath.address.inside > 0)
    assert.equal(byPath['address.postcode'], undefined)
    assert.deepEqual(
      byPath.vehicleRegistration.diffs.map((d) => d.what),
      ['Max']
    )
    assert.deepEqual(byPath.contactDetails.diffs[0], {
      what: 'Required',
      before: 'Required',
      after: 'Optional'
    })

    // Every schema that uses the carrier changes at the carrier's path.
    const creation = changes.roots.find(
      (r) => r.id === 'create-movement-request'
    )
    assert.ok(
      creation.fields.some(
        (f) =>
          f.path === 'intendedCarriers[].fleetNumber' && f.status === 'added'
      )
    )
  })

  test('reports schema files added and removed', () => {
    const after = buildModel(beta2)
    const trimmed = {
      ...before,
      roots: before.roots.filter((r) => r.id !== 'record-delivery-request'),
      fragments: [
        ...before.fragments,
        {
          id: 'gone',
          file: 'common/gone.schema.json',
          title: 'Gone',
          tree: { type: 'string' }
        }
      ]
    }
    const changes = compareModels(trimmed, after, 'main')
    assert.deepEqual(
      changes.roots.map((r) => [r.id, r.status]),
      [['record-delivery-request', 'added']]
    )
    assert.deepEqual(
      changes.fragments.map((f) => [f.id, f.status]),
      [['gone', 'removed']]
    )
  })

  test('says so when a version is new', () => {
    const changes = compareModels(null, before, 'main')
    assert.equal(changes.newVersion, true)
    assert.match(
      changesMarkdown([{ slug: 'beta-2', name: 'beta-2', changes }]),
      /New version: it isn't in main/
    )
  })
})
