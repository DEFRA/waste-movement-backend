import {
  apiCode,
  brokerOrDealerEntry,
  carrier,
  commercialProducer,
  householdProducer,
  municipalProducer,
  receiver,
  supportingReference,
  validatorFor,
  wasteItem
} from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/creation/create-movement-request.schema.json'
)

const intendedCarriers = [carrier]
const intendedReceivers = [receiver]
const wasteItems = [wasteItem]

describe('create-movement-request schema', () => {
  // apiCode is sent in the x-api-code header, not the body.
  test('rejects apiCode in the body', () => {
    const payload = {
      apiCode,
      producer: householdProducer,
      intendedCarriers,
      intendedReceivers,
      wasteItems
    }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test('producer is required', () => {
    const payload = { intendedCarriers, intendedReceivers, wasteItems }
    expect(validateAjv(payload).valid).toBe(false)
  })

  test.each([
    ['Household', householdProducer],
    ['Commercial', commercialProducer],
    ['Municipal', municipalProducer]
  ])('accepts a valid %s producer', (_wasteSource, producer) => {
    const payload = {
      producer,
      intendedCarriers,
      intendedReceivers,
      wasteItems
    }
    expect(validateAjv(payload).valid).toBe(true)
  })

  test('rejects an additional property beyond the declared ones', () => {
    const payload = {
      producer: householdProducer,
      intendedCarriers,
      intendedReceivers,
      wasteItems,
      extra: 'not allowed'
    }
    expect(validateAjv(payload).valid).toBe(false)
  })

  // A single carrier's rules are covered by carrier.test.js — these
  // cover the list itself and confirm each entry is checked against
  // carrier.schema.json.
  describe('intendedCarriers', () => {
    // Scenario: A Movement isn't created when no intended carrier is declared.
    test('is required', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'intendedCarriers' }
        })
      )
    })

    test('rejects an empty list of carriers', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        intendedCarriers: []
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'minItems',
          instancePath: '/intendedCarriers'
        })
      )
    })

    test('rejects a single carrier rather than a list', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        intendedCarriers: carrier
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/intendedCarriers'
        })
      )
    })

    test('accepts one carrier', () => {
      const payload = {
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers,
        wasteItems
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts more than one carrier', () => {
      const payload = {
        producer: householdProducer,
        intendedCarriers: [
          carrier,
          { ...carrier, organisationName: 'Second Carrier Ltd' }
        ],
        intendedReceivers,
        wasteItems
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose carrier is invalid', () => {
      const { organisationName, ...invalidCarrier } = carrier
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        intendedCarriers: [invalidCarrier]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/intendedCarriers/0',
          params: { missingProperty: 'organisationName' }
        })
      )
    })

    test('rejects the list when any one carrier is invalid, reporting the error against that carrier', () => {
      const { organisationName, ...invalidSecond } = carrier
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        intendedCarriers: [carrier, invalidSecond]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/intendedCarriers/1',
          params: { missingProperty: 'organisationName' }
        })
      )
      expect(
        errors.filter(({ instancePath }) =>
          instancePath.startsWith('/intendedCarriers/0')
        )
      ).toEqual([])
    })
  })

  // A single receiver's rules are covered by receiver/receiver.test.js — these
  // cover the list itself and confirm each entry is checked against
  // receiver.schema.json.
  describe('intendedReceivers', () => {
    test('is required', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        intendedCarriers
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'intendedReceivers' }
        })
      )
    })

    test('rejects an empty list of receivers', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers: [],
        wasteItems
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'minItems',
          instancePath: '/intendedReceivers'
        })
      )
    })

    test('rejects a single receiver rather than a list', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers: receiver,
        wasteItems
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/intendedReceivers'
        })
      )
    })

    test('accepts one receiver', () => {
      const payload = {
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers,
        wasteItems
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts more than one receiver', () => {
      const payload = {
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers: [
          receiver,
          {
            ...receiver,
            siteName: 'Second Receiver Site',
            authorisationNumber: 'XX9999XX'
          }
        ],
        wasteItems
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects the list when any one receiver is invalid, reporting each error against that receiver', () => {
      const { siteName, ...invalidSecond } = {
        ...receiver,
        receiptAddress: { ...receiver.receiptAddress, postcode: 'NOTAPOSTCODE' }
      }
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers: [receiver, invalidSecond],
        wasteItems
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/intendedReceivers/1',
          params: { missingProperty: 'siteName' }
        })
      )
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'pattern',
          instancePath: '/intendedReceivers/1/receiptAddress/postcode'
        })
      )
      expect(
        errors.filter(({ instancePath }) =>
          instancePath.startsWith('/intendedReceivers/0')
        )
      ).toEqual([])
    })
  })

  // A waste item's rules are covered by waste-item/*.test.js — these confirm
  // wasteItems is required and that the $ref wiring is live.
  describe('wasteItems', () => {
    // Scenario: A Movement is created when a valid physical form, containers
    // and weight are declared.
    test('accepts a valid waste item', () => {
      const payload = {
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers,
        wasteItems
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('is required', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'wasteItems' }
        })
      )
    })

    test('rejects an empty list of waste items', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers,
        wasteItems: []
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'minItems',
          instancePath: '/wasteItems'
        })
      )
    })

    test('rejects a payload whose waste item is invalid, reporting the error against that item', () => {
      const { valid, errors } = validateAjv({
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers,
        wasteItems: [
          {
            physicalDetails: { ...wasteItem.physicalDetails, form: 'Plasma' }
          }
        ]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/wasteItems/0/physicalDetails/form'
        })
      )
    })
  })

  describe('brokerOrDealer', () => {
    const brokerOrDealer = { isPresent: true, items: [brokerOrDealerEntry] }

    test('is optional', () => {
      const payload = {
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers,
        wasteItems
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts a declared broker or dealer', () => {
      const payload = {
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers,
        wasteItems,
        brokerOrDealer
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    // The rules themselves live in broker-or-dealer.test.js; this only proves
    // the $ref is wired up, so a rejection propagates to the payload.
    test('rejects a payload whose broker or dealer is invalid', () => {
      const payload = {
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers,
        wasteItems,
        brokerOrDealer: { isPresent: false, items: brokerOrDealer.items }
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })

  // supportingReferences' own rules are covered by
  // supporting-references.test.js — these confirm it's optional and that the
  // $ref wiring is live.
  describe('supportingReferences', () => {
    test('is optional', () => {
      const payload = {
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers,
        wasteItems
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers,
        wasteItems,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })
  })

  // specialHandlingRequirements' own rules are covered by
  // special-handling-requirements.test.js — these confirm it's optional and
  // that the $ref wiring is live.
  describe('specialHandlingRequirements', () => {
    // Scenario: A Movement is successfully created without special handling
    // requirements.
    test('is optional', () => {
      const payload = {
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers,
        wasteItems
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid specialHandlingRequirements', () => {
      const payload = {
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers,
        wasteItems,
        specialHandlingRequirements: 'Handle with care and keep upright.'
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose specialHandlingRequirements is invalid', () => {
      const payload = {
        producer: householdProducer,
        intendedCarriers,
        intendedReceivers,
        wasteItems,
        specialHandlingRequirements: 'A'.repeat(501)
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
