import { address as validAddress, validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('beta-2/common/address.schema.json')

describe('address schema', () => {
  test('accepts a valid address', () => {
    expect(validateAjv(validAddress).valid).toBe(true)
  })

  test('accepts an address with only postcode (fullAddress is optional)', () => {
    const { fullAddress, ...payload } = validAddress
    expect(validateAjv(payload).valid).toBe(true)
  })

  test('rejects an address missing postcode', () => {
    const { postcode, ...payload } = validAddress
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('rejects an empty fullAddress', () => {
    const payload = { ...validAddress, fullAddress: '' }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test.each([
    'SW1A 1AA',
    'EC1A 1BB',
    'W1A 0AX',
    'M1 1AE',
    'B33 8TH',
    'CR2 6XH',
    'DN55 1PT',
    'GIR 0AA'
  ])('accepts UK postcode %s', (postcode) => {
    expect(validateAjv({ postcode }).valid).toBe(true)
  })

  test.each(['A65 F4E2', 'D02 AF30', 'D6W FA12'])(
    'accepts Irish Eircode %s',
    (postcode) => {
      expect(validateAjv({ postcode }).valid).toBe(true)
    }
  )

  test('rejects a malformed postcode', () => {
    expect(validateAjv({ postcode: 'NOTAPOSTCODE' }).valid).toBe(false)
  })
})
