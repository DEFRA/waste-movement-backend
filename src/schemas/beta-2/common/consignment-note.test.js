import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('beta-2/common/consignment-note.schema.json')

// The business scenarios — each regulator's format, a code or a reason but
// not both, and when hazardous waste needs a note at all — live in
// routes/beta-2/create-movement.test.js. These cover the edges of the note's
// own rules that those scenarios don't.
describe('Feature: Schema - declaring a consignment note', () => {
  describe('Scenario: Validation passes for the edges of the regulator formats', () => {
    test.each([
      ['EA / NRW, with a digit in the premises code', 'CJ123E/A0001'],
      ['EA / NRW, with a trailing letter', 'CJTILE/A0001B'],
      ['EA / NRW, in lower case', 'cjtile/a0001']
    ])('accepts an %s', (_format, code) => {
      expect(validateAjv({ code }).valid).toBe(true)
    })
  })

  describe('Scenario: Validation fails just outside the regulator formats', () => {
    test.each([
      ['a SEPA code one digit short', 'SA123456'],
      ['a NIEA code one digit long', 'DA12345678'],
      ['an EA / NRW code with a short serial', 'CJTILE/A01'],
      ['an EA / NRW code with a one-character premises code', 'C/A0001'],
      ['a SEPA code in lower case', 'sa1234567']
    ])('rejects %s', (_, code) => {
      const { valid, errors } = validateAjv({ code })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'pattern', instancePath: '/code' })
      )
    })
  })

  // null, "" and leaving the field out all mean "not provided", so none of
  // them is checked against the format or counts as giving both fields.
  describe('Scenario: A null or empty field is treated as not provided', () => {
    test.each([null, ''])('accepts a code of %p', (code) => {
      expect(validateAjv({ code }).valid).toBe(true)
    })

    test.each([null, ''])('accepts a reason of %p', (reasonForNoCode) => {
      expect(validateAjv({ reasonForNoCode }).valid).toBe(true)
    })

    test.each([null, ''])(
      'accepts a reason of %p alongside a code',
      (reasonForNoCode) => {
        expect(
          validateAjv({ code: 'CJTILE/A0001', reasonForNoCode }).valid
        ).toBe(true)
      }
    )

    test.each([null, ''])('accepts a reason alongside a code of %p', (code) => {
      expect(
        validateAjv({
          code,
          reasonForNoCode: 'Carrier did not provide a consignment note'
        }).valid
      ).toBe(true)
    })

    test('accepts an empty consignment note', () => {
      expect(validateAjv({}).valid).toBe(true)
    })
  })

  describe('Additional coverage', () => {
    test('rejects a code given as a number', () => {
      const { valid, errors } = validateAjv({ code: 1234567 })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/code' })
      )
    })

    test('rejects a reason given as a number', () => {
      const { valid, errors } = validateAjv({ reasonForNoCode: 3 })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/reasonForNoCode'
        })
      )
    })

    test('rejects the fields it replaces', () => {
      const { valid, errors } = validateAjv({
        hazardousWasteConsignmentCode: 'CJTILE/A0001'
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
