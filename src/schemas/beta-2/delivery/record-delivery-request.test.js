import { apiCode, supportingReference, validatorFor } from '../test-helpers.js'

const validateAjv = validatorFor(
  'beta-2/delivery/record-delivery-request.schema.json'
)

describe('record-delivery-request schema', () => {
  const movementIds = ['25HRA0B2']

  test('accepts a valid payload', () => {
    expect(validateAjv({ movementIds: ['25HRA0B2'] }).valid).toBe(true)
  })

  test('accepts multiple movementIds', () => {
    expect(validateAjv({ movementIds: ['25HRA0B2', '25HRA0B3'] }).valid).toBe(
      true
    )
  })

  // apiCode is sent in the x-api-code header (D-046), not the body.
  test('rejects apiCode in the body', () => {
    expect(validateAjv({ apiCode, movementIds }).valid).toBe(false)
  })

  test('movementIds is required', () => {
    expect(validateAjv({}).valid).toBe(false)
  })

  test('rejects an empty movementIds list', () => {
    expect(validateAjv({ movementIds: [] }).valid).toBe(false)
  })

  test('rejects an additional property beyond the declared ones', () => {
    expect(
      validateAjv({ movementIds: ['25HRA0B2'], extra: 'not allowed' }).valid
    ).toBe(false)
  })

  // supportingReferences' own rules are covered by
  // supporting-references.test.js — these confirm it's optional and that the
  // $ref wiring is live.
  describe('supportingReferences', () => {
    test('is optional', () => {
      const payload = { movementIds }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('accepts valid supportingReferences', () => {
      const payload = {
        movementIds,
        supportingReferences: [supportingReference]
      }
      expect(validateAjv(payload).valid).toBe(true)
    })

    test('rejects a payload whose supportingReferences is invalid', () => {
      const payload = {
        movementIds,
        supportingReferences: [{ ...supportingReference, label: 'Not A Label' }]
      }
      expect(validateAjv(payload).valid).toBe(false)
    })
  })
})
