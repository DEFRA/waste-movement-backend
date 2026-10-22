import {
  hazardous,
  hazardousPresent,
  validatorFor
} from '../../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/common/waste-item/hazardous.schema.json'
)

// The business scenarios live in routes/beta-2/create-movement.test.js and
// routes/beta-2/record-receipt-undocumented.test.js. These cover the
// edges of the declaration's shape that the scenarios don't.
describe('Feature: Schema - declaring hazardous properties', () => {
  describe('Additional coverage', () => {
    test('accepts waste declared as having no hazardous properties', () => {
      expect(validateAjv(hazardous).valid).toBe(true)
    })

    test('accepts waste declared as having hazardous properties, with their codes', () => {
      expect(validateAjv(hazardousPresent).valid).toBe(true)
    })

    // The codes listed in the ticket, rather than read back from the schema.
    test.each([
      'HP_1',
      'HP_2',
      'HP_3',
      'HP_4',
      'HP_5',
      'HP_6',
      'HP_7',
      'HP_8',
      'HP_9',
      'HP_10',
      'HP_11',
      'HP_12',
      'HP_13',
      'HP_14',
      'HP_15',
      'HP_POP'
    ])('accepts %s', (code) => {
      expect(validateAjv({ isPresent: true, codes: [code] }).valid).toBe(true)
    })

    // Storing them without duplicates is a separate change.
    test('accepts duplicate codes', () => {
      expect(
        validateAjv({ isPresent: true, codes: ['HP_4', 'HP_4'] }).valid
      ).toBe(true)
    })

    test('rejects an unknown field', () => {
      const { valid, errors } = validateAjv({ ...hazardous, hpCodes: [] })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'additionalProperties',
          instancePath: ''
        })
      )
    })

    test('reports only the missing codes when only isPresent is given', () => {
      const { valid, errors } = validateAjv({ isPresent: true })

      // ajv also reports the failed 'if', which the validator drops.
      expect(valid).toBe(false)
      expect(errors.filter(({ keyword }) => keyword !== 'if')).toEqual([
        expect.objectContaining({
          keyword: 'required',
          params: { missingProperty: 'codes' }
        })
      ])
    })

    test('reports a missing isPresent, and the codes given without it', () => {
      const { valid, errors } = validateAjv({ codes: ['HP_4'] })

      expect(valid).toBe(false)
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'required',
            instancePath: '',
            params: { missingProperty: 'isPresent' }
          }),
          expect.objectContaining({ keyword: 'not', instancePath: '/codes' })
        ])
      )
    })
  })
})
