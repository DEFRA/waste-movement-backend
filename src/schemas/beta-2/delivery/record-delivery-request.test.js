import {
  apiCode,
  supportingReference,
  carrier,
  validatorFor
} from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/delivery/record-delivery-request.schema.json'
)

describe('record-delivery-request schema', () => {
  const movementIds = ['25HRA0B2']

  test('accepts a valid payload', () => {
    expect(validateAjv({ apiCode, movementIds, carrier }).valid).toBe(true)
  })

  test('accepts multiple movementIds', () => {
    expect(
      validateAjv({ apiCode, movementIds: ['25HRA0B2', '25HRA0B3'], carrier })
        .valid
    ).toBe(true)
  })

  test('apiCode is required', () => {
    expect(validateAjv({ movementIds, carrier }).valid).toBe(false)
  })

  test('rejects a malformed apiCode', () => {
    expect(
      validateAjv({ apiCode: 'not-a-uuid', movementIds, carrier }).valid
    ).toBe(false)
  })

  test('movementIds is required', () => {
    expect(validateAjv({ apiCode, carrier }).valid).toBe(false)
  })

  test('rejects an empty movementIds list', () => {
    expect(validateAjv({ apiCode, movementIds: [], carrier }).valid).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    expect(
      validateAjv({ apiCode, movementIds, carrier, extra: 'not allowed' }).valid
    ).toBe(false)
  })

  // supportingReferences' own rules are covered by
  // supporting-references.test.js — these confirm it's optional and that the
  // $ref wiring is live.
  describe('supportingReferences', () => {
    test('is optional', () => {
      const payload = { apiCode, movementIds, carrier }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        apiCode,
        movementIds,
        carrier,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose supportingReferences is invalid', () => {
      const payload = {
        apiCode,
        movementIds,
        carrier,
        supportingReferences: [{ ...supportingReference, label: 'Not A Label' }]
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })

  // carrier's own rules are covered by carrier.test.js — these confirm
  // it's required, that it's a single carrier rather than a list, and that the
  // $ref wiring is live.
  describe('carrier', () => {
    test('is required', () => {
      const { valid, errors } = validateAjv({ apiCode, movementIds })

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
        apiCode,
        movementIds,
        carrier: [carrier]
      })

      expect(valid).toBe(false)
      expect(errors).toContainEqual(
        expect.objectContaining({ keyword: 'type', instancePath: '/carrier' })
      )
    })

    test('rejects a payload whose carrier is invalid', () => {
      const { organisationName, ...invalidCarrier } = carrier
      const { valid, errors } = validateAjv({
        apiCode,
        movementIds,
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
})
