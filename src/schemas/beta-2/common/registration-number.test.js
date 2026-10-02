import { ALL_CARRIER_REGISTRATION_NUMBER_REGEXES } from '@defra/waste-movement-utils'
import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/common/registration-number.schema.json'
)

// Known good and bad values copied from waste-movement-utils'
// src/test/data/carrier-registration-numbers.js, so this pattern is checked
// against the same data as the Phase-1 carrierOrBrokerDealerRegistrationNumber
// it was translated from. Copied rather than imported: that file isn't part of
// utils' public API.
const validRegistrationNumbers = [
  ['England and NRW lower tier, shortest', 'CBDL999'],
  ['England and NRW lower tier', 'CBDL99999'],
  ['England and NRW lower tier, long', 'CBDL99999999999999999999'],
  ['England and NRW upper tier, shortest', 'CBDU999'],
  ['England and NRW upper tier', 'CBDU99999'],
  ['England and NRW upper tier, long', 'CBDU99999999999999999999'],
  ['SEPA WCR/R', 'WCR/R/9999999'],
  ['SEPA SCO', 'SCO/999999'],
  ['SEPA SEA', 'SEA/999999'],
  ['SEPA SNO', 'SNO/999999'],
  ['SEPA SWE', 'SWE/999999'],
  ['SEPA WCR', 'WCR/999999'],
  ['SEPA PCT, shortest', 'PCT-A-999'],
  ['SEPA PCT, longest', 'PCT-E-9999999'],
  ['Northern Ireland upper tier, shortest', 'ROC UT 9'],
  ['Northern Ireland upper tier, longest', 'ROC UT 99999'],
  ['Northern Ireland lower tier, shortest', 'ROC LT 9'],
  ['Northern Ireland lower tier, longest', 'ROC LT 99999'],
  ['lower case', 'cbdu99999']
]

const invalidRegistrationNumbers = [
  ['no tier letter', 'CBD999'],
  ['unknown tier letter', 'CBDT999'],
  ['England lower tier with too few digits', 'CBDL99'],
  ['England upper tier with too few digits', 'CBDU99'],
  ['SEPA WCR/R with too few digits', 'WCR/R/999999'],
  ['SEPA WCR/R with too many digits', 'WCR/R/99999999'],
  ['SEPA SCO with too few digits', 'SCO/99999'],
  ['SEPA SCO with too many digits', 'SCO/9999999'],
  ['two-letter SEPA prefix', 'SC/999999'],
  ['unknown SEPA prefix', 'SCD/999999'],
  ['Northern Ireland without tier T', 'ROC U 9'],
  ['Northern Ireland lower tier without T', 'ROC L 9'],
  ['Northern Ireland unknown tier', 'ROC DT 9'],
  ['Northern Ireland upper tier with too many digits', 'ROC UT 999999'],
  ['Northern Ireland lower tier with too many digits', 'ROC LT 999999'],
  ['whitespace only', '   '],
  ['PCT with a digit for the letter', 'PCT-2-9999999'],
  ['PCT with a trailing letter', 'PCT-E-999999A']
]

describe('registration-number schema', () => {
  test.each(validRegistrationNumbers)('accepts %s (%s)', (_label, value) => {
    expect(validateAjv(value).valid).toBe(true)
  })

  test.each(invalidRegistrationNumbers)('rejects %s (%s)', (_label, value) => {
    const { valid, errors } = validateAjv(value)

    expect(valid).toBe(false)
    expect(errors).toContainEqual(
      expect.objectContaining({ keyword: 'pattern' })
    )
  })

  // The schema can't import the shared regexes (see src/schemas/README.md),
  // so this holds it to them instead: every known value must get the same
  // verdict from the pattern as from Phase 1.
  describe('parity with the shared waste-movement-utils regexes', () => {
    const isValidInPhase1 = (value) =>
      ALL_CARRIER_REGISTRATION_NUMBER_REGEXES.some((regex) => regex.test(value))

    test.each([...validRegistrationNumbers, ...invalidRegistrationNumbers])(
      'agrees with utils for %s (%s)',
      (_label, value) => {
        expect(validateAjv(value).valid).toBe(isValidInPhase1(value))
      }
    )

    // The one deliberate difference: Phase 1 doesn't trim registration
    // numbers, so it rejects surrounding whitespace. The beta-2 pattern has
    // always accepted it (see broker-or-dealer.test.js).
    test('differs from utils only by accepting surrounding whitespace', () => {
      expect(isValidInPhase1(' CBDL999 ')).toBe(false)
      expect(validateAjv(' CBDL999 ').valid).toBe(true)
    })
  })

  test('rejects an empty string', () => {
    expect(validateAjv('').valid).toBe(false)
  })

  test('rejects a value embedded in other text', () => {
    expect(validateAjv('Registration CBDU99999').valid).toBe(false)
  })

  test.each([
    ['a number', 1],
    ['null', null]
  ])('rejects %s', (_label, value) => {
    const { valid, errors } = validateAjv(value)

    expect(valid).toBe(false)
    expect(errors).toContainEqual(expect.objectContaining({ keyword: 'type' }))
  })
})
