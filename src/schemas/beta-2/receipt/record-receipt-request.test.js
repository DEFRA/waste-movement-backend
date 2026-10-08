import {
  apiCode,
  brokerOrDealerEntry,
  supportingReference,
  carrier,
  receiver,
  validatorFor,
  wasteItem
} from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/receipt/record-receipt-request.schema.json'
)

describe('record-receipt-request schema', () => {
  const brokerOrDealer = { isPresent: true, items: [brokerOrDealerEntry] }
  const wasteItems = [wasteItem]

  test('accepts a valid payload', () => {
    expect(validateAjv({ carrier, receiver, wasteItems }).valid).toBe(true)
  })

  // apiCode is sent in the x-api-code header, not the body.
  test('rejects apiCode in the body', () => {
    expect(validateAjv({ apiCode, carrier, receiver, wasteItems }).valid).toBe(
      false
    )
  })

  test('rejects an additional property beyond the declared ones', () => {
    expect(
      validateAjv({ carrier, receiver, wasteItems, extra: 'not allowed' }).valid
    ).toBe(false)
  })

  // carrier's own rules are covered by carrier.test.js — these confirm
  // it's required, that it's a single carrier rather than a list, and that the
  // $ref wiring is live.
  describe('carrier', () => {
    test('is required', () => {
      const { valid, errors } = validateAjv({ receiver, wasteItems })

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
        wasteItems
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
        wasteItems
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
      const { valid, errors } = validateAjv({ carrier, wasteItems })

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
        wasteItems
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
        wasteItems
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

  // A waste item's rules are covered by waste-item/*.test.js — these confirm
  // wasteItems is required and that the $ref wiring is live.
  describe('wasteItems', () => {
    // Scenario: A Receipt is created when a valid physical form, containers
    // and weight are declared.
    test('accepts a valid waste item', () => {
      expect(validateAjv({ carrier, receiver, wasteItems }).valid).toBe(true)
    })

    test('is required', () => {
      const { valid, errors } = validateAjv({ carrier, receiver })

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
        carrier,
        receiver,
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
        carrier,
        receiver,
        wasteItems: [
          { physicalDetails: { ...wasteItem.physicalDetails, form: 'solid' } }
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
    test('is optional', () => {
      const payload = {
        carrier,
        receiver,
        wasteItems,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts a declared broker or dealer', () => {
      const payload = { carrier, receiver, wasteItems, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    // The rules themselves live in broker-or-dealer.test.js; this only proves
    // the $ref is wired up, so a rejection propagates to the payload.
    test('rejects a payload whose broker or dealer is invalid', () => {
      const payload = {
        carrier,
        receiver,
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
      const payload = { carrier, receiver, wasteItems, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        carrier,
        receiver,
        wasteItems,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose supportingReferences is invalid', () => {
      const payload = {
        carrier,
        receiver,
        wasteItems,
        supportingReferences: [{ ...supportingReference, label: 'Not A Label' }]
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
