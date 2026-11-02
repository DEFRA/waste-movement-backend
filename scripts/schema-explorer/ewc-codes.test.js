// Checks the EWC code module the bundles use (ewc-codes.js) answers exactly as
// the utils package's own does: for every code, the code with spaces in it,
// and codes that don't exist. Run with `npm run test:schema-explorer`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  validEwcCodes,
  isValidEwcCode,
  isValidHazardousEwcCode
} from '@defra/waste-movement-utils'
import { ewcCodesModule } from './ewc-codes.js'

// The generated module, loaded as the bundles would run it.
const file = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'schema-explorer-ewc-')),
  'ewc-codes.mjs'
)
fs.writeFileSync(file, await ewcCodesModule())
const small = await import(pathToFileURL(file).href)

test('the bundled EWC codes answer as the utils package does', () => {
  const inputs = [
    ...validEwcCodes.map((e) => e.code),
    ...validEwcCodes.map(
      (e) => `${e.code.slice(0, 2)} ${e.code.slice(2, 4)} ${e.code.slice(4)}`
    ),
    '999999',
    '000000',
    '20030',
    '2003011',
    'abcdef',
    '',
    null,
    undefined
  ]
  for (const code of inputs) {
    assert.equal(
      small.isValidEwcCode(code),
      isValidEwcCode(code),
      `isValidEwcCode(${code})`
    )
    assert.equal(
      small.isValidHazardousEwcCode(code),
      isValidHazardousEwcCode(code),
      `isValidHazardousEwcCode(${code})`
    )
  }
})
