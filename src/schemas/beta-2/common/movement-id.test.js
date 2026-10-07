import { validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('beta-2/common/movement-id.schema.json')

// A two-digit year prefix followed by a six-character sqid from A–Z
// and 0–9, 8 characters in all.
describe('movement-id schema', () => {
  test('accepts a minted movement ID', () => {
    expect(validateAjv('25HRA0B2').valid).toBe(true)
  })

  test('rejects an empty string', () => {
    expect(validateAjv('').valid).toBe(false)
  })

  test('rejects a letter year prefix', () => {
    expect(validateAjv('YYHRA0B2').valid).toBe(false)
  })

  test('rejects lowercase characters', () => {
    expect(validateAjv('25hra0b2').valid).toBe(false)
  })

  test('rejects a suffix shorter than six characters', () => {
    expect(validateAjv('25HRA0B').valid).toBe(false)
  })

  // waste-tracking-id-backend's sqids (minLength 6) produce a seven-character
  // suffix from the 35,937th ID of a year (e.g. 26 + 7ZCU888); the fixed
  // eight-character format rejects those.
  test('rejects a suffix longer than six characters', () => {
    expect(validateAjv('267ZCU888').valid).toBe(false)
  })

  test('rejects a non-string', () => {
    expect(validateAjv(12345678).valid).toBe(false)
  })
})
