import { validEwcCodes } from '@defra/waste-movement-utils'
import { classification, validatorFor } from '../../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/common/waste-item/classification.schema.json'
)

// The business scenarios — a missing or empty description, missing or
// unrecognised EWC codes, and between one and five codes — live in
// routes/beta-2/create-movement.test.js. The schema checks only an EWC
// code's format; whether a well-formed code is recognised is checked by
// common/helpers/waste-reference-data-checks.js. These cover what's left of the
// classification's shape.
describe('Feature: Schema - classifying a waste item', () => {
  const withCode = (code) => ({ ...classification, ewcCodes: [code] })

  describe('Scenario: Every code in the EWC reference data is in the accepted format', () => {
    test('accepts every code', () => {
      const rejected = validEwcCodes
        .map(({ code }) => code)
        .filter((code) => !validateAjv(withCode(code)).valid)

      expect(rejected).toEqual([])
    })
  })

  describe('Scenario: Validation fails for an EWC code that is not six digits', () => {
    test.each(['2003011', '200301 ', 'INVALID'])('rejects %p', (code) => {
      const { valid, errors } = validateAjv(withCode(code))

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'pattern',
          instancePath: '/ewcCodes/0'
        })
      )
    })

    test('rejects a code given as a number', () => {
      const { valid, errors } = validateAjv(withCode(200301))

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/ewcCodes/0'
        })
      )
    })
  })

  describe('Additional coverage', () => {
    test('accepts a valid classification', () => {
      expect(validateAjv(classification).valid).toBe(true)
    })

    test('reports a badly formatted EWC code against that code, not the first', () => {
      const { valid, errors } = validateAjv({
        ...classification,
        ewcCodes: ['200301', '2001']
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'pattern',
          instancePath: '/ewcCodes/1'
        })
      )
    })

    test('rejects a single EWC code rather than a list', () => {
      const { valid, errors } = validateAjv({
        ...classification,
        ewcCodes: '200301'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/ewcCodes' })
      )
    })

    test('rejects a waste description that is not a string', () => {
      const { valid, errors } = validateAjv({
        ...classification,
        wasteDescription: 42
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/wasteDescription'
        })
      )
    })

    test('rejects an unknown field on a classification', () => {
      const { valid, errors } = validateAjv({
        ...classification,
        ewcCode: '200301'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'additionalProperties',
          instancePath: ''
        })
      )
    })
  })
})
