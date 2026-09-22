import { writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { validate, getErrors, ajv } from './index.js'

describe('schema registry', () => {
  test('loads schemas keyed by their path-based $id', () => {
    expect(
      ajv.getSchema('beta-2/common/producer/producer-base.schema.json')
    ).toBeDefined()
  })

  test('validates a payload against a registered schema', () => {
    const valid = validate('beta-2/common/producer/producer-base.schema.json', {
      councilMovement: true
    })

    expect(valid).toBe(true)
    expect(getErrors('beta-2/common/producer/producer-base.schema.json')).toBe(
      null
    )
  })

  test('exposes errors after a failed validation', () => {
    const valid = validate(
      'beta-2/common/producer/producer-base.schema.json',
      {}
    )

    expect(valid).toBe(false)
    expect(
      getErrors('beta-2/common/producer/producer-base.schema.json')
    ).not.toBeNull()
  })

  test('throws for an unknown $id', () => {
    expect(() => validate('does/not/exist.schema.json', {})).toThrow(
      'No schema registered with $id "does/not/exist.schema.json".'
    )
  })

  test('throws at import time when a schema $id does not match its path', async () => {
    const badSchemaPath = path.join(
      import.meta.dirname,
      '../beta-2/common/producer/__id-mismatch.schema.json'
    )

    writeFileSync(
      badSchemaPath,
      JSON.stringify({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'totally/wrong/path.schema.json',
        type: 'object'
      })
    )

    try {
      await expect(import('./index.js')).rejects.toThrow(
        /does not match its path/
      )
    } finally {
      unlinkSync(badSchemaPath)
    }
  })
})
