import { getErrors, validate } from '../../validate/index.js'

const schemaId = 'beta-2/common/contact-details.schema.json'

const validateAjv = (payload) => {
  const valid = validate(schemaId, payload)
  return { valid, errors: valid ? null : getErrors(schemaId) }
}

describe('contact-details schema', () => {
  const validContactDetails = {
    emailAddress: 'producer@example.com',
    phoneNumber: '01234567890'
  }

  test('accepts emailAddress and phoneNumber together', () => {
    expect(validateAjv(validContactDetails).valid).toBe(true)
  })

  test('accepts emailAddress only', () => {
    const { phoneNumber, ...payload } = validContactDetails
    expect(validateAjv(payload).valid).toBe(true)
  })

  test('accepts phoneNumber only', () => {
    const { emailAddress, ...payload } = validContactDetails
    expect(validateAjv(payload).valid).toBe(true)
  })

  test('rejects an empty object (neither emailAddress nor phoneNumber)', () => {
    expect(validateAjv({}).valid).toBe(false)
  })

  test('rejects a malformed emailAddress', () => {
    const payload = { emailAddress: 'not-an-email' }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('rejects a malformed phoneNumber', () => {
    const payload = { phoneNumber: 'not-a-number' }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('rejects a phoneNumber with too few digits', () => {
    const payload = { phoneNumber: '123456' }
    expect(validateAjv(payload).valid).toBe(false)
  })
})
