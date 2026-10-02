import { getErrors, validate } from '../../validate/index.js'

const schemaId = 'beta-2/common/receivers.schema.json'

const validateAjv = (payload) => {
  const valid = validate(schemaId, payload)
  return { valid, errors: valid ? null : getErrors(schemaId) }
}

// The rules for a single receiver live in receiver.test.js; these cover the
// list itself and prove each entry is checked against receiver.schema.json.
describe('Feature: Declaring the receivers of the waste', () => {
  const receiver = {
    siteName: 'Receiver Site Ltd',
    authorisationNumber: 'EAS/P/123456',
    receiptAddress: {
      fullAddress: '3 Receiver Road, Test City',
      postcode: 'TE1 3RC'
    },
    contactDetails: {
      emailAddress: 'receiver@example.com',
      phoneNumber: '01234567890'
    }
  }

  describe('Scenario: Validation passes when an intended receiver and all its valid details are declared', () => {
    test('validation passes when a single valid receiver is submitted', () => {
      expect(validateAjv([receiver]).valid).toBe(true)
    })
  })

  describe('Scenario: Validation passes when more than one intended receiver is declared', () => {
    test('validation passes when valid details are given for each intended receiver', () => {
      const second = {
        ...receiver,
        siteName: 'Second Receiver Site',
        authorisationNumber: 'XX9999XX'
      }

      expect(validateAjv([receiver, second]).valid).toBe(true)
    })
  })

  describe('Scenario: Validation fails when any one of several intended receivers is declared with missing or invalid details', () => {
    test('validation fails and each invalid field is reported against its receiver', () => {
      const { siteName, ...invalidSecond } = {
        ...receiver,
        receiptAddress: { ...receiver.receiptAddress, postcode: 'NOTAPOSTCODE' }
      }

      const { valid, errors } = validateAjv([receiver, invalidSecond])

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/1',
          params: { missingProperty: 'siteName' }
        })
      )
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'pattern',
          instancePath: '/1/receiptAddress/postcode'
        })
      )
      expect(
        errors.filter(({ instancePath }) => instancePath.startsWith('/0'))
      ).toEqual([])
    })
  })

  describe('Additional coverage', () => {
    test('rejects an empty list of receivers', () => {
      const { valid, errors } = validateAjv([])

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'minItems', instancePath: '' })
      )
    })
  })
})
