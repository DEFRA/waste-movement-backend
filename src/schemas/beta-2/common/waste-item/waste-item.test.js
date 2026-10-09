import { validatorFor, wasteItem } from '../../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/common/waste-item/waste-item.schema.json'
)

// The rules for physical details live in physical-details.test.js and
// weight.test.js; these cover the waste item itself and prove its
// physicalDetails is checked against physical-details.schema.json.
describe('Feature: Schema - declaring a waste item', () => {
  describe('Scenario: Validation passes when a waste item and its valid physical details are declared', () => {
    test('validation passes when the physical details are valid', () => {
      expect(validateAjv(wasteItem).valid).toBe(true)
    })
  })

  describe('Scenario: Validation fails when a waste item is declared without physical details', () => {
    test('validation fails and the physical details are reported as required', () => {
      const { valid, errors } = validateAjv({})

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'physicalDetails' }
        })
      )
    })
  })

  describe('Additional coverage', () => {
    test('rejects a waste item whose physical details are invalid, reporting the error against them', () => {
      const { form, ...withoutForm } = wasteItem.physicalDetails
      const { valid, errors } = validateAjv({ physicalDetails: withoutForm })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/physicalDetails',
          params: { missingProperty: 'form' }
        })
      )
    })

    test('rejects a waste item whose weight is invalid, reporting the error against the weight', () => {
      const { valid, errors } = validateAjv({
        physicalDetails: {
          ...wasteItem.physicalDetails,
          totalWeight: { ...wasteItem.physicalDetails.totalWeight, unit: 'kg' }
        }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/physicalDetails/totalWeight/unit'
        })
      )
    })

    test('rejects an unknown field on a waste item', () => {
      const { valid, errors } = validateAjv({ ...wasteItem, ewcCode: '200301' })

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
