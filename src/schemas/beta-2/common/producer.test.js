import { getErrors, validate } from '../../validate/index.js'

const producerSchemaId = 'beta-2/common/producer/producer.schema.json'

const validateAjv = (payload) => {
  const valid = validate(producerSchemaId, payload)
  return { valid, errors: valid ? null : getErrors(producerSchemaId) }
}

// ---------------------------------------------------------------------------
// Structured after the "Producer payload validation for the create endpoint"
// Gherkin feature — one describe per Scenario, test names following the
// When/Then wording. Coverage that isn't called out by that feature file is
// kept below under "Additional coverage", so nothing from the previous
// wasteSource-grouped version of this file is lost.
// ---------------------------------------------------------------------------
describe('Feature: Producer payload validation for the create endpoint', () => {
  const commercialProducer = {
    wasteSource: 'Commercial',
    organisationName: 'ACME Waste Producers Ltd',
    authorisationNumber: 'EAS/P/123456',
    address: {
      fullAddress: '10 Industrial Way, Test City',
      postcode: 'TE1 2PQ'
    },
    contactDetails: {
      emailAddress: 'producer@example.com',
      phoneNumber: '01234567890'
    },
    sicCode: '38110',
    councilMovement: false
  }

  const municipalProducer = {
    wasteSource: 'Municipal',
    organisationName: 'Test Council',
    reasonForNoAuthorisationNumber: 'TBC',
    address: {
      fullAddress: 'Council Depot, Test City',
      postcode: 'TE1 5CD'
    },
    contactDetails: {
      emailAddress: 'waste.services@example.gov.uk',
      phoneNumber: '01234567890'
    },
    councilMovement: true
  }

  const householdProducer = {
    wasteSource: 'Household',
    councilMovement: true
  }

  describe('Scenario: Household producer is submitted correctly', () => {
    test('the Movement is created successfully when only wasteSource and councilMovement are provided', () => {
      expect(validateAjv(householdProducer).valid).toBe(true)
    })
  })

  describe('Scenario: Household producer includes a forbidden field', () => {
    test.each([
      ['organisationName', 'Acme'],
      ['authorisationNumber', 'EAS/P/123456'],
      ['reasonForNoAuthorisationNumber', 'TBC'],
      ['sicCode', '38110'],
      ['contactDetails', { emailAddress: 'producer@example.com' }],
      [
        'address',
        { fullAddress: '5 Elm Street, Test Town', postcode: 'TE2 4HH' }
      ]
    ])('the payload is rejected when %s is also provided', (field, value) => {
      const payload = { ...householdProducer, [field]: value }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })

  describe('Scenario: Commercial producer is missing a required field', () => {
    test.each(['organisationName', 'sicCode', 'address'])(
      'the payload is rejected when %s is missing',
      (field) => {
        const { [field]: excluded, ...payload } = commercialProducer
        expect(validateAjv(payload).valid).toBe(false)
      }
    )
  })

  describe('Scenario: Municipal producer is missing a required field', () => {
    test.each(['organisationName', 'address'])(
      'the payload is rejected when %s is missing',
      (field) => {
        const { [field]: excluded, ...payload } = municipalProducer
        expect(validateAjv(payload).valid).toBe(false)
      }
    )
  })

  // contactDetails' own field-level rules (e.g. neither emailAddress nor
  // phoneNumber provided) are covered by contact-details.test.js — this just
  // confirms producer requires the field at all.
  describe('Scenario: Commercial or Municipal producer omits contactDetails', () => {
    test.each(['Commercial', 'Municipal'])(
      'the payload is rejected for a %s producer when contactDetails is missing',
      (wasteSource) => {
        const base =
          wasteSource === 'Commercial' ? commercialProducer : municipalProducer
        const { contactDetails, ...payload } = base
        expect(validateAjv(payload).valid).toBe(false)
      }
    )
  })

  // address and contactDetails are each defined in their own schema file
  // (see address.test.js / contact-details.test.js for exhaustive format
  // coverage) and pulled in here via $ref. These are thin checks that the
  // $ref wiring is live — i.e. a malformed nested value is actually
  // rejected when submitted as part of a producer — not a re-test of every
  // format edge case.
  describe('Scenario: Commercial or Municipal producer has an invalid nested field', () => {
    test.each(['Commercial', 'Municipal'])(
      'the payload is rejected for a %s producer when contactDetails has neither emailAddress nor phoneNumber',
      (wasteSource) => {
        const base =
          wasteSource === 'Commercial' ? commercialProducer : municipalProducer
        const payload = { ...base, contactDetails: {} }
        expect(validateAjv(payload).valid).toBe(false)
      }
    )

    test('the payload is rejected for a Commercial producer with a malformed postcode', () => {
      const payload = {
        ...commercialProducer,
        address: { ...commercialProducer.address, postcode: 'NOTAPOSTCODE' }
      }
      expect(validateAjv(payload).valid).toBe(false)
    })

    test('the payload is rejected for a Commercial producer with a malformed phoneNumber', () => {
      const payload = {
        ...commercialProducer,
        contactDetails: {
          ...commercialProducer.contactDetails,
          phoneNumber: 'not-a-number'
        }
      }
      expect(validateAjv(payload).valid).toBe(false)
    })

    test('the payload is rejected for a Commercial producer with a malformed emailAddress', () => {
      const payload = {
        ...commercialProducer,
        contactDetails: {
          ...commercialProducer.contactDetails,
          emailAddress: 'not-an-email'
        }
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })

  describe('Scenario: Commercial or Municipal producer provides neither authorisationNumber nor a reason', () => {
    test.each(['Commercial', 'Municipal'])(
      'the payload is rejected for a %s producer when neither authorisationNumber nor reasonForNoAuthorisationNumber is provided',
      (wasteSource) => {
        const base =
          wasteSource === 'Commercial' ? commercialProducer : municipalProducer
        const {
          authorisationNumber,
          reasonForNoAuthorisationNumber,
          ...payload
        } = base
        expect(validateAjv(payload).valid).toBe(false)
      }
    )
  })

  describe('Scenario: Commercial or Municipal producer provides both authorisationNumber and a reason', () => {
    test.each(['Commercial', 'Municipal'])(
      'the payload is rejected for a %s producer when both authorisationNumber and reasonForNoAuthorisationNumber are provided',
      (wasteSource) => {
        const base =
          wasteSource === 'Commercial' ? commercialProducer : municipalProducer
        const payload = {
          ...base,
          authorisationNumber: 'EAS/P/123456',
          reasonForNoAuthorisationNumber: 'TBC'
        }
        expect(validateAjv(payload).valid).toBe(false)
      }
    )
  })

  describe('Scenario: sicCode is not five digits', () => {
    test.each(['Commercial', 'Municipal'])(
      'the payload is rejected for a %s producer with a malformed sicCode',
      (wasteSource) => {
        const base =
          wasteSource === 'Commercial' ? commercialProducer : municipalProducer
        const payload = { ...base, sicCode: '123' }
        expect(validateAjv(payload).valid).toBe(false)
      }
    )
  })

  // -------------------------------------------------------------------------
  // Coverage below isn't called out by any scenario in the feature file
  // above, but existed in the previous version of this test file — kept so
  // nothing is lost in the rewrite.
  // -------------------------------------------------------------------------
  describe('Additional coverage: Commercial producer', () => {
    test('accepts a valid Commercial producer', () => {
      expect(validateAjv(commercialProducer).valid).toBe(true)
    })

    test('rejects wasteSource given in lower/upper mismatched case', () => {
      const payload = { ...commercialProducer, wasteSource: 'COMMERCIAL' }
      expect(validateAjv(payload).valid).toBe(false)
    })

    test('accepts reasonForNoAuthorisationNumber instead of authorisationNumber', () => {
      const { authorisationNumber, ...payload } = commercialProducer
      const withReason = {
        ...payload,
        reasonForNoAuthorisationNumber: 'TBC'
      }
      expect(validateAjv(withReason).valid).toBe(true)
    })

    test('accepts any free text for reasonForNoAuthorisationNumber (enum values TBC)', () => {
      const { authorisationNumber, ...payload } = commercialProducer
      const withReason = {
        ...payload,
        reasonForNoAuthorisationNumber: 'Exemption pending renewal'
      }
      expect(validateAjv(withReason).valid).toBe(true)
    })

    test('rejects an empty organisationName', () => {
      const payload = { ...commercialProducer, organisationName: '' }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })

  describe('Additional coverage: Municipal producer', () => {
    test('accepts a valid Municipal producer', () => {
      expect(validateAjv(municipalProducer).valid).toBe(true)
    })

    test('does not require sicCode', () => {
      expect(validateAjv(municipalProducer).valid).toBe(true)
    })

    test('rejects an empty organisationName', () => {
      const payload = { ...municipalProducer, organisationName: '' }
      expect(validateAjv(payload).valid).toBe(false)
    })

    test('accepts authorisationNumber instead of reasonForNoAuthorisationNumber', () => {
      const { reasonForNoAuthorisationNumber, ...payload } = municipalProducer
      const withAuthorisationNumber = {
        ...payload,
        authorisationNumber: 'EAS/P/123456'
      }
      expect(validateAjv(withAuthorisationNumber).valid).toBe(true)
    })
  })
})
