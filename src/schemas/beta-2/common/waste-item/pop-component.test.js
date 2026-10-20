import { popComponent, validatorFor } from '../../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/common/waste-item/pop-component.schema.json'
)

// The business scenarios — codes, concentrations, thresholds, and one or the
// other but not both — live in
// routes/beta-2/record-receipt-without-delivery.test.js. Whether a code is
// recognised is checked by common/helpers/waste-reference-data-checks.js.
// These cover the edges of the component's own rules.
describe('Feature: Schema - declaring a POP component', () => {
  describe('Scenario: A concentration of null or an empty string is treated as not provided', () => {
    test.each([null, ''])(
      'accepts a concentration of %p alongside a threshold',
      (concentration) => {
        expect(
          validateAjv({
            code: 'PFOA',
            concentration,
            concentrationThresholdOperator: 'LESS_THAN'
          }).valid
        ).toBe(true)
      }
    )
  })

  describe('Additional coverage', () => {
    test('accepts a concentration', () => {
      expect(validateAjv(popComponent).valid).toBe(true)
    })

    test('accepts a very small concentration', () => {
      expect(validateAjv({ code: 'PFOA', concentration: 1e-9 }).valid).toBe(
        true
      )
    })

    test.each(['0.5', 'abc', true])(
      'rejects a concentration of %p, which is not a number',
      (concentration) => {
        const { valid, errors } = validateAjv({ code: 'PFOA', concentration })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(
          expect.objectContaining({
            keyword: 'enum',
            instancePath: '/concentration'
          })
        )
      }
    )

    test('rejects a threshold in lower case', () => {
      const { valid, errors } = validateAjv({
        code: 'PFOA',
        concentrationThresholdOperator: 'less_than'
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/concentrationThresholdOperator'
        })
      )
    })

    test('rejects a code that is not a string', () => {
      const { valid, errors } = validateAjv({ code: 42, concentration: 1 })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/code' })
      )
    })

    test('rejects an unknown field on a component', () => {
      const { valid, errors } = validateAjv({ ...popComponent, name: 'PFOA' })

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
