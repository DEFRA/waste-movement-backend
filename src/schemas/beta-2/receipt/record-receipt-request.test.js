import {
  apiCode,
  brokerOrDealerEntry,
  supportingReference,
  carrier,
  receiver,
  validatorFor,
  physicalDetails
} from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/receipt/record-receipt-request.schema.json'
)

describe('record-receipt-request schema', () => {
  const brokerOrDealer = { isPresent: true, items: [brokerOrDealerEntry] }

  test('accepts a valid payload', () => {
    expect(validateAjv({ carrier, receiver, physicalDetails }).valid).toBe(true)
  })

  // apiCode is sent in the x-api-code header, not the body.
  test('rejects apiCode in the body', () => {
    expect(
      validateAjv({ apiCode, carrier, receiver, physicalDetails }).valid
    ).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    expect(
      validateAjv({ carrier, receiver, physicalDetails, extra: 'not allowed' })
        .valid
    ).toBe(false)
  })

  // carrier's own rules are covered by carrier.test.js — these confirm
  // it's required, that it's a single carrier rather than a list, and that the
  // $ref wiring is live.
  describe('carrier', () => {
    test('is required', () => {
      const { valid, errors } = validateAjv({ receiver, physicalDetails })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'carrier' }
        })
      )
    })

    test('rejects a list of carriers', () => {
      const { valid, errors } = validateAjv({
        carrier: [carrier],
        receiver,
        physicalDetails
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/carrier' })
      )
    })

    test('rejects a payload whose carrier is invalid', () => {
      const { organisationName, ...invalidCarrier } = carrier
      const { valid, errors } = validateAjv({
        carrier: invalidCarrier,
        receiver,
        physicalDetails
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/carrier',
          params: { missingProperty: 'organisationName' }
        })
      )
    })
  })

  // receiver's own rules are covered by receiver/receiver.test.js — these
  // confirm it's required, that it's a single receiver rather than a list, and
  // that the $ref wiring is live.
  describe('receiver', () => {
    test('is required', () => {
      const { valid, errors } = validateAjv({ carrier, physicalDetails })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'receiver' }
        })
      )
    })

    test('rejects a list of receivers', () => {
      const { valid, errors } = validateAjv({
        carrier,
        receiver: [receiver],
        physicalDetails
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/receiver' })
      )
    })

    test('rejects a payload whose receiver is invalid', () => {
      const { siteName, ...invalidReceiver } = receiver
      const { valid, errors } = validateAjv({
        carrier,
        receiver: invalidReceiver,
        physicalDetails
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/receiver',
          params: { missingProperty: 'siteName' }
        })
      )
    })
  })

  // physicalDetails' own rules are covered by
  // waste-item/physical-details.test.js — these confirm physicalDetails is
  // required and that the $ref wiring is live.
  describe('physicalDetails', () => {
    // Scenario: A Receipt is created when a valid physical form, containers
    // and weight are declared.
    test('accepts valid physical details', () => {
      expect(validateAjv({ carrier, receiver, physicalDetails }).valid).toBe(
        true
      )
    })

    test('is required', () => {
      const { valid, errors } = validateAjv({ carrier, receiver })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'physicalDetails' }
        })
      )
    })

    test('rejects a list of physical details', () => {
      const { valid, errors } = validateAjv({
        carrier,
        receiver,
        physicalDetails: [physicalDetails]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'type',
          instancePath: '/physicalDetails'
        })
      )
    })

    test('rejects invalid physical details, reporting the error against the field', () => {
      const { valid, errors } = validateAjv({
        carrier,
        receiver,
        physicalDetails: { ...physicalDetails, form: 'solid' }
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          instancePath: '/physicalDetails/form'
        })
      )
    })
  })

  describe('brokerOrDealer', () => {
    test('is optional', () => {
      const payload = {
        carrier,
        receiver,
        physicalDetails,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts a declared broker or dealer', () => {
      const payload = { carrier, receiver, physicalDetails, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    // The rules themselves live in broker-or-dealer.test.js; this only proves
    // the $ref is wired up, so a rejection propagates to the payload.
    test('rejects a payload whose broker or dealer is invalid', () => {
      const payload = {
        carrier,
        receiver,
        physicalDetails,
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
      const payload = { carrier, receiver, physicalDetails, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        carrier,
        receiver,
        physicalDetails,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose supportingReferences is invalid', () => {
      const payload = {
        carrier,
        receiver,
        physicalDetails,
        supportingReferences: [{ ...supportingReference, label: 'Not A Label' }]
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
