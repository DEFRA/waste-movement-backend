import {
  apiCode,
  brokerOrDealerEntry,
  supportingReference,
  carrier,
  receiver,
  treatment,
  validatorFor,
  wasteItem
} from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/receipt/record-receipt-without-delivery-request.schema.json'
)
const reason = 'No delivery'

describe('record-receipt-without-delivery-request schema', () => {
  const brokerOrDealer = { isPresent: true, items: [brokerOrDealerEntry] }
  // A receipt needs at least one treatment on every waste item.
  const receiptWasteItem = { ...wasteItem, treatments: [treatment] }
  const wasteItems = [receiptWasteItem]

  test('accepts a valid payload', () => {
    expect(validateAjv({ reason, carrier, receiver, wasteItems }).valid).toBe(
      true
    )
  })

  // apiCode is sent in the x-api-code header, not the body.
  test('rejects apiCode in the body', () => {
    expect(
      validateAjv({ apiCode, reason, carrier, receiver, wasteItems }).valid
    ).toBe(false)
  })

  test('reason is required', () => {
    expect(validateAjv({ carrier, receiver, wasteItems }).valid).toBe(false)
  })

  test('rejects an empty reason', () => {
    expect(
      validateAjv({ reason: '', carrier, receiver, wasteItems }).valid
    ).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    expect(
      validateAjv({
        reason,
        carrier,
        receiver,
        wasteItems,
        extra: 'not allowed'
      }).valid
    ).toBe(false)
  })

  // carrier's own rules are covered by carrier.test.js — these confirm
  // it's required, that it's a single carrier rather than a list, and that the
  // $ref wiring is live.
  describe('carrier', () => {
    test('is required', () => {
      const { valid, errors } = validateAjv({ reason, receiver, wasteItems })

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
        reason,
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
        reason,
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
      const { valid, errors } = validateAjv({ reason, carrier, wasteItems })

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
        reason,
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
        reason,
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
      expect(validateAjv({ reason, carrier, receiver, wasteItems }).valid).toBe(
        true
      )
    })

    test('is required', () => {
      const { valid, errors } = validateAjv({ reason, carrier, receiver })

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
        reason,
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
        reason,
        carrier,
        receiver,
        wasteItems: [
          {
            ...receiptWasteItem,
            physicalDetails: { ...wasteItem.physicalDetails, form: 'solid' }
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

  // A treatment's rules are covered by waste-item/treatment*.test.js — these
  // confirm every waste item needs at least one treatment and that the $ref
  // wiring is live. (Creating a movement forbids treatments on the same shared
  // waste item.)
  describe('treatments on each waste item', () => {
    const receiptWith = (...items) => ({
      reason,
      carrier,
      receiver,
      wasteItems: items
    })

    // Scenario: A Receipt is created when a treatment with a valid disposal or
    // recovery code and weight is declared.
    test('accepts a waste item with a valid treatment', () => {
      expect(validateAjv(receiptWith(receiptWasteItem)).valid).toBe(true)
    })

    // Scenario: A Receipt is created when more than one treatment is declared.
    test('accepts a waste item with more than one treatment', () => {
      const disposal = { ...treatment, disposalOrRecoveryCode: 'D10' }
      expect(
        validateAjv(
          receiptWith({ ...wasteItem, treatments: [treatment, disposal] })
        ).valid
      ).toBe(true)
    })

    // Scenario: A Receipt isn't created when no treatment is declared.
    test('requires treatments on every waste item', () => {
      const { valid, errors } = validateAjv(
        receiptWith(receiptWasteItem, wasteItem)
      )

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '/wasteItems/1',
          params: { missingProperty: 'treatments' }
        })
      )
      expect(
        errors.filter(({ instancePath }) =>
          instancePath.startsWith('/wasteItems/0')
        )
      ).toEqual([])
    })

    test('rejects an empty list of treatments', () => {
      const { valid, errors } = validateAjv(
        receiptWith({ ...wasteItem, treatments: [] })
      )

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'minItems',
          instancePath: '/wasteItems/0/treatments'
        })
      )
    })

    // Scenario: A Receipt isn't created when any one of several treatments is
    // declared with missing or invalid details.
    test('reports each invalid field of each invalid treatment, and nothing for a valid one', () => {
      const { weight, ...noWeight } = treatment
      const { valid, errors } = validateAjv(
        receiptWith({
          ...wasteItem,
          treatments: [
            treatment,
            noWeight,
            { ...treatment, disposalOrRecoveryCode: '' }
          ]
        })
      )

      expect(valid).toBe(false)
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'required',
            instancePath: '/wasteItems/0/treatments/1',
            params: { missingProperty: 'weight' }
          }),
          expect.objectContaining({
            keyword: 'enum',
            instancePath: '/wasteItems/0/treatments/2/disposalOrRecoveryCode'
          })
        ])
      )
      expect(
        errors.filter(({ instancePath }) =>
          instancePath.startsWith('/wasteItems/0/treatments/0')
        )
      ).toEqual([])
    })
  })

  describe('brokerOrDealer', () => {
    test('is optional', () => {
      const payload = {
        reason,
        carrier,
        receiver,
        wasteItems,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts a declared broker or dealer', () => {
      const payload = { reason, carrier, receiver, wasteItems, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    // The rules themselves live in broker-or-dealer.test.js; this only proves
    // the $ref is wired up, so a rejection propagates to the payload.
    test('rejects a payload whose broker or dealer is invalid', () => {
      const payload = {
        reason,
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
      const payload = { reason, carrier, receiver, wasteItems, brokerOrDealer }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        reason,
        carrier,
        receiver,
        wasteItems,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose supportingReferences is invalid', () => {
      const payload = {
        reason,
        carrier,
        receiver,
        wasteItems,
        supportingReferences: [{ ...supportingReference, label: 'Not A Label' }]
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
