import { carrier, validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor('beta-2/common/carrier/carriers.schema.json')

// The rules for a single carrier live in carrier.test.js; these cover the
// list itself and prove each entry is checked against carrier.schema.json.
describe('Feature: Schema - declaring the carriers of the waste', () => {
  describe('Scenario: Validation passes when a waste carrier and all its valid details are declared', () => {
    test('validation passes when valid details are given for a single waste carrier', () => {
      expect(validateAjv([carrier]).valid).toBe(true)
    })
  })

  describe('Scenario: Validation passes when more than one waste carrier is declared', () => {
    test('validation passes when valid details are given for multiple waste carriers', () => {
      const second = {
        ...carrier,
        organisationName: 'Second Carrier Ltd',
        registrationNumber: 'ROC UT 9999',
        vehicleRegistration: 'XY34 ZZZ'
      }

      expect(validateAjv([carrier, second]).valid).toBe(true)
    })
  })

  describe('Scenario: Validation fails when a waste carrier is not declared', () => {
    test('validation fails and at least one waste carrier is reported as required', () => {
      const { valid, errors } = validateAjv([])

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'minItems', instancePath: '' })
      )
    })
  })

  describe('Additional coverage', () => {
    test('rejects the list when any one carrier is invalid, reporting the error against that carrier', () => {
      const { organisationName, ...invalidSecond } = carrier

      const { valid, errors } = validateAjv([carrier, invalidSecond])

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/1',
          params: { missingProperty: 'organisationName' }
        })
      )
      expect(
        errors.filter(({ instancePath }) => instancePath.startsWith('/0'))
      ).toEqual([])
    })
  })
})
