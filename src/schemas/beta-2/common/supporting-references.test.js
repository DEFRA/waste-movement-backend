import { getErrors, validate } from '../../validate/index.js'

const supportingReferencesSchemaId =
  'beta-2/common/supporting-references.schema.json'

const validateAjv = (payload) => {
  const valid = validate(supportingReferencesSchemaId, payload)
  return {
    valid,
    errors: valid ? null : getErrors(supportingReferencesSchemaId)
  }
}

describe('Feature: Recording supporting references', () => {
  const recognisedLabels = [
    'Weighbridge Number',
    'PO Number',
    'Job Number',
    'Invoice Number',
    'Waste Ticket Number',
    'Other'
  ]

  const supportingReference = {
    label: 'PO Number',
    reference: 'PO-123456'
  }

  const supportingReferences = [supportingReference]

  const buildSupportingReferences = (count) =>
    Array.from({ length: count }, (_, index) => ({
      ...supportingReference,
      reference: `PO-${index + 1}`
    }))

  describe('Scenario: Supporting references are provided correctly', () => {
    test('the supporting references are accepted when one is provided with a recognised label and a reference', () => {
      expect(validateAjv(supportingReferences).valid).toBe(true)
    })

    test('the supporting references are accepted when more than one is provided, each with a recognised label and a reference', () => {
      expect(validateAjv(buildSupportingReferences(3)).valid).toBe(true)
    })

    test.each(recognisedLabels)(
      'the supporting references are accepted when a supporting reference has the recognised label "%s"',
      (label) => {
        const payload = [{ ...supportingReference, label }]
        expect(validateAjv(payload).valid).toBe(true)
      }
    )
  })

  describe("Scenario: A supporting reference's label and reference aren't provided as a pair", () => {
    test.each([
      ['a reference', 'label'],
      ['a label', 'reference']
    ])(
      'the supporting references are rejected when one has %s and no %s',
      (_, missingField) => {
        const { [missingField]: excluded, ...item } = supportingReference
        expect(validateAjv([item]).valid).toBe(false)
      }
    )
  })

  describe('Scenario: More than 6 supporting references are provided', () => {
    test('the supporting references are rejected when more than 6 are provided', () => {
      expect(validateAjv(buildSupportingReferences(7)).valid).toBe(false)
    })

    test('the supporting references are accepted when exactly 6 are provided', () => {
      expect(validateAjv(buildSupportingReferences(6)).valid).toBe(true)
    })
  })

  describe("Scenario: A supporting reference's reference exceeds the maximum length", () => {
    test('the supporting references are rejected when a reference is longer than 50 characters', () => {
      const payload = [{ ...supportingReference, reference: 'A'.repeat(51) }]
      expect(validateAjv(payload).valid).toBe(false)
    })

    test('the supporting references are accepted when a reference is exactly 50 characters', () => {
      const payload = [{ ...supportingReference, reference: 'A'.repeat(50) }]
      expect(validateAjv(payload).valid).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Coverage below isn't called out by any scenario in the feature file, but
  // follows from it requiring "one or more" supporting references, each with a
  // "recognised label".
  // -------------------------------------------------------------------------
  describe('Additional coverage: Recording supporting references', () => {
    test('rejects an empty array', () => {
      expect(validateAjv([]).valid).toBe(false)
    })

    test.each([
      ['an unrecognised label', 'Purchase order'],
      ['a recognised label in mismatched case', 'PO NUMBER'],
      ['an empty label', '']
    ])('rejects %s', (_, label) => {
      const payload = [{ ...supportingReference, label }]
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
