import {
  apiCode,
  brokerOrDealerEntry,
  carrier,
  supportingReference,
  validatorFor
} from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/collection/create-collection-request.schema.json'
)

describe('create-collection-request schema: beta-2', () => {
  const brokerOrDealer = { isPresent: true, items: [brokerOrDealerEntry] }
  const dutyOfCareConfirmed = true

  test('accepts a payload with a carrier and dutyOfCareConfirmed', () => {
    expect(validateAjv({ carrier, dutyOfCareConfirmed }).valid).toBe(true)
  })

  // apiCode is sent in the x-api-code header, not the body.
  test('rejects apiCode in the body', () => {
    expect(validateAjv({ apiCode, carrier }).valid).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    const payload = {
      carrier,
      dutyOfCareConfirmed,
      extra: 'not allowed'
    }
    expect(validateAjv(payload).valid).toBe(false)
  })

  // carrier's own rules are covered by carrier.test.js — these confirm
  // it's required, that it's a single carrier rather than a list, and that the
  // $ref wiring is live.
  describe('carrier', () => {
    test('is required', () => {
      const { valid, errors } = validateAjv({})

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({
          keyword: 'required',
          instancePath: '',
          params: { missingProperty: 'carrier' }
        })
      )
    })

    test('accepts a valid carrier', () => {
      expect(validateAjv({ carrier, dutyOfCareConfirmed }).valid).toBe(true)
    })

    test('rejects a list of carriers', () => {
      const { valid, errors } = validateAjv({
        carrier: [carrier],
        dutyOfCareConfirmed
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/carrier' })
      )
    })

    test('rejects a payload whose carrier is invalid', () => {
      const { organisationName, ...invalidCarrier } = carrier
      const { valid, errors } = validateAjv({
        carrier: invalidCarrier
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

  describe('Feature: Declaring the duty of care confirmation when creating a collection', () => {
    describe('Scenario: A Collection is created when a carrier confirms duty of care', () => {
      test('validation passes when a duty of care confirmation is submitted', () => {
        expect(validateAjv({ carrier, dutyOfCareConfirmed }).valid).toBe(true)
      })
    })

    describe("Scenario: A Collection isn't created when a carrier fails to submit a duty of care", () => {
      test('validation fails and the duty of care confirmation is reported as required', () => {
        const { valid, errors } = validateAjv({ carrier })

        expect(valid).toBe(false)
        expect(errors).toContainEqual(
          expect.objectContaining({
            keyword: 'required',
            instancePath: '',
            params: { missingProperty: 'dutyOfCareConfirmed' }
          })
        )
      })
    })

    describe('Additional coverage', () => {
      test('accepts a duty of care confirmation of false', () => {
        expect(validateAjv({ carrier, dutyOfCareConfirmed: false }).valid).toBe(
          true
        )
      })

      test.each([['true'], [1], [null]])(
        'rejects a duty of care confirmation of %j, which is not a boolean',
        (value) => {
          const { valid, errors } = validateAjv({
            carrier,
            dutyOfCareConfirmed: value
          })

          expect(valid).toBe(false)
          expect(errors).toContainEqual(
            expect.objectContaining({
              keyword: 'type',
              instancePath: '/dutyOfCareConfirmed'
            })
          )
        }
      )
    })
  })

  describe('brokerOrDealer', () => {
    test('is optional', () => {
      const payload = {
        carrier,
        supportingReferences: [supportingReference],
        dutyOfCareConfirmed
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts a declared broker or dealer', () => {
      const payload = { carrier, brokerOrDealer, dutyOfCareConfirmed }
      expect(validateAjv(payload).valid).toBe(true)
    })

    // The rules themselves live in broker-or-dealer.test.js; this only proves
    // the $ref is wired up, so a rejection propagates to the payload.
    test('rejects a payload whose broker or dealer is invalid', () => {
      const payload = {
        carrier,
        brokerOrDealer: { isPresent: false, items: brokerOrDealer.items },
        dutyOfCareConfirmed
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })

  // supportingReferences' own rules are covered by
  // supporting-references.test.js — these confirm it's optional and that the
  // $ref wiring is live.
  describe('supportingReferences', () => {
    test('is optional', () => {
      const payload = { carrier, brokerOrDealer, dutyOfCareConfirmed }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        carrier,
        supportingReferences: [supportingReference],
        dutyOfCareConfirmed
      }
      expect(validateAjv(payload).valid).toBe(true)
    })
  })

  // specialHandlingRequirements' own rules are covered by
  // special-handling-requirements.test.js — these confirm it's optional and
  // that the $ref wiring is live.
  describe('specialHandlingRequirements', () => {
    test('is optional', () => {
      const payload = { carrier, brokerOrDealer, dutyOfCareConfirmed }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid specialHandlingRequirements', () => {
      const payload = {
        carrier,
        specialHandlingRequirements: 'Handle with care and keep upright.',
        dutyOfCareConfirmed
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose specialHandlingRequirements is invalid', () => {
      const payload = {
        carrier,
        specialHandlingRequirements: 'A'.repeat(501)
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
