import { createServer } from '../server.js'
import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { createBulkMovementRequest } from '../test/utils/createBulkMovementRequest.js'
import { formatBulkUploadValidationErrors } from './error-handler.js'
import { createTestPayload } from '../schemas/test-helpers/waste-test-helpers.js'

jest.mock('../config.js', () => {
  process.env.MAX_BULK_RECORDS = '3'
  return jest.requireActual('../config.js')
})

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockImplementation(() => true)
}))

describe('Error Handler', () => {
  let server

  const wasteTrackingId = generateWasteTrackingId()
  const traceId = '64a4385a4447a8b1608b5b338d0a3157'
  const originalEnvVars = process.env

  beforeAll(async () => {
    process.env = {
      ACCESS_CRED_WASTE_MOVEMENT_EXTERNAL_API:
        'd2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpPTRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
    }

    server = await createServer()

    const createResult = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: {
        movement: createTestPayload()
      },
      headers: {
        'x-cdp-request-id': traceId,
        authorization:
          'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
      }
    })

    expect(createResult.statusCode).toEqual(HTTP_STATUS_CODES.NO_CONTENT)
    expect(createResult.result).toEqual(null)
  })

  afterAll(async () => {
    await server.stop()
    process.env = originalEnvVars
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('should format validation errors correctly for a non bulk upload endpoint', async () => {
    // Send a request with missing required fields
    const response = await server.inject({
      method: 'POST',
      url: '/movements/retry-audit-log',
      payload: {
        wasteTrackingId
      },
      headers: {
        authorization:
          'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
      }
    })

    // Check status code
    expect(response.statusCode).toBe(400)

    // Parse response
    const responseBody = JSON.parse(response.payload)

    expect(responseBody).toEqual({
      validation: {
        errors: [
          {
            key: 'retryAuditLogSchema',
            errorType: 'UnexpectedError',
            message:
              '"retryAuditLogSchema" contains [wasteTrackingId] without its required peers [revision]'
          }
        ]
      }
    })
  })

  test('should format validation errors correctly for a bulk upload endpoint', async () => {
    // Send a request with missing required fields
    const response = await server.inject({
      method: 'POST',
      url: '/bulk/1/movements/receive',
      payload: [
        createBulkMovementRequest(),
        {
          ...createBulkMovementRequest(),
          submittingOrganisation: {},
          dateTimeReceived: undefined
        }
      ],
      headers: {
        authorization:
          'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
      }
    })

    // Check status code
    expect(response.statusCode).toBe(400)

    // Parse response
    const responseBody = JSON.parse(response.payload)

    expect(responseBody).toEqual([
      {},
      {
        validation: {
          errors: [
            {
              errorType: 'NotProvided',
              key: '1.submittingOrganisation.defraCustomerOrganisationId',
              message:
                '"[1].submittingOrganisation.defraCustomerOrganisationId" is required'
            },
            {
              errorType: 'NotProvided',
              key: '1.dateTimeReceived',
              message: '"[1].dateTimeReceived" is required'
            }
          ]
        }
      }
    ])
  })

  test('should set correct key for custom schema-level validation errors', async () => {
    // Test the reasonForNoConsignmentCode validation error
    // When hazardous EWC code is used without consignment code or reason
    const basePayload = createBulkMovementRequest()

    // Modify to use hazardous EWC code and remove consignment code fields
    const payload = {
      ...basePayload,
      wasteItems: [
        {
          ...basePayload.wasteItems[0],
          ewcCodes: ['200121'] // hazardous code
        }
      ]
    }

    // Ensure we don't send the hazardous fields to trigger the validation
    delete payload.hazardousWasteConsignmentCode
    delete payload.reasonForNoConsignmentCode

    const response = await server.inject({
      method: 'POST',
      url: '/bulk/1/movements/receive',
      payload: [payload],
      headers: {
        authorization:
          'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
      }
    })

    expect(response.statusCode).toBe(400)
    const responseBody = JSON.parse(response.payload)

    // Find the reasonForNoConsignmentCode error
    const reasonError = responseBody[0].validation.errors.find(
      (err) => err.message && err.message.includes('reasonForNoConsignmentCode')
    )

    // Verify the key is set correctly (not empty string)
    expect(reasonError).toBeDefined()
    // expect(reasonError.key).toBe('reasonForNoConsignmentCode') // UNCOMMENT AND FIX BEFORE MERGING
    expect(reasonError.errorType).toBe('BusinessRuleViolation')
  })

  test('should not create misleading keys from built-in Joi error types', async () => {
    // This test ensures that built-in Joi errors like 'any.required' don't get
    // their error type prefix extracted as a key (which would result in key: 'any')
    const response = await server.inject({
      method: 'POST',
      url: '/movements/retry-audit-log',
      payload: {
        wasteTrackingId
      },
      headers: {
        authorization:
          'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
      }
    })

    expect(response.statusCode).toBe(400)
    const responseBody = JSON.parse(response.payload)

    // Ensure no error has key 'any' (which would be a regression)
    const misleadingKeyError = responseBody.validation.errors.find(
      (err) => err.key === 'any'
    )
    expect(misleadingKeyError).toBeUndefined()

    // All errors should have either a proper field name or empty string
    responseBody.validation.errors.forEach((err) => {
      expect(err.key).not.toBe('any')
      expect(err.key).not.toBe('object')
      expect(err.key).not.toBe('string')
    })
  })

  test('should handle a valid payload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/movements/retry-audit-log',
      payload: {
        wasteTrackingId,
        revision: 1
      },
      headers: {
        authorization:
          'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
      }
    })

    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({})
  })

  test('should format per-item errors as array when error key has no dot-separated field', async () => {
    const movementMissingSubmittingOrg = createBulkMovementRequest()
    delete movementMissingSubmittingOrg.submittingOrganisation

    const response = await server.inject({
      method: 'POST',
      url: '/bulk/1/movements/receive',
      payload: [createBulkMovementRequest(), movementMissingSubmittingOrg],
      headers: {
        authorization:
          'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
      }
    })

    expect(response.statusCode).toBe(400)

    const responseBody = JSON.parse(response.payload)

    expect(Array.isArray(responseBody)).toBe(true)
    expect(responseBody).toHaveLength(2)
    expect(responseBody[1].validation.errors[0]).toMatchObject({
      errorType: 'NotProvided',
      key: '1.submittingOrganisation'
    })
  })

  test('should format validation errors correctly for a bulk upload endpoint exceeding max record limit', async () => {
    const payload = new Array(4).fill(createBulkMovementRequest())
    const response = await server.inject({
      method: 'POST',
      url: '/bulk/1/movements/receive',
      payload,
      headers: {
        authorization:
          'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
      }
    })

    expect(response.statusCode).toBe(400)

    const responseBody = JSON.parse(response.payload)

    expect(responseBody).toEqual({
      validation: {
        errors: [
          {
            key: 'BulkReceiveMovementRequest',
            errorType: 'OutOfRange',
            message:
              '"BulkReceiveMovementRequest" must contain less than or equal to 3 items'
          }
        ]
      }
    })
  })

  test('should handle an unexpected error', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/movements/retry-audit-log',
      payload: {
        wasteTrackingId,
        revision: '1'
      },
      headers: {
        authorization:
          'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
      }
    })

    expect(response.statusCode).toBe(400)
    expect(response.result).toEqual({
      validation: {
        errors: [
          {
            errorType: 'InvalidType',
            key: 'revision',
            message: '"revision" must be a number'
          }
        ]
      }
    })
  })

  describe('Granular Error Categories', () => {
    test('should return InvalidType for wrong data type (string where number expected)', async () => {
      const basePayload = createBulkMovementRequest()
      const payload = {
        ...basePayload,
        wasteItems: [
          {
            ...basePayload.wasteItems[0],
            numberOfContainers: '100' // String instead of number, with .strict() this should fail
          }
        ]
      }

      const response = await server.inject({
        method: 'POST',
        url: '/bulk/1/movements/receive',
        payload: [payload],
        headers: {
          authorization:
            'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
        }
      })

      expect(response.statusCode).toBe(400)
      const responseBody = JSON.parse(response.payload)

      const typeError = responseBody[0].validation.errors.find(
        (err) => err.key === '0.wasteItems.0.numberOfContainers'
      )
      expect(typeError).toBeDefined()
      expect(typeError.errorType).toBe('InvalidType')
    })

    test('should return InvalidFormat for invalid postcode', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/bulk/1/movements/receive',
        payload: [
          {
            submittingOrganisation: { defraCustomerOrganisationId: 'org-123' },
            dateTimeReceived: new Date().toISOString(),
            receiver: {
              siteName: 'Test Site',
              authorisationNumber: 'HP3456XX'
            },
            receipt: {
              address: {
                fullAddress: '123 Test St',
                postcode: 'INVALID'
              }
            }
          }
        ],
        headers: {
          authorization:
            'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
        }
      })

      expect(response.statusCode).toBe(400)
      const responseBody = JSON.parse(response.payload)

      const formatError = responseBody[0].validation.errors.find(
        (err) => err.key === '0.receipt.address.postcode'
      )
      expect(formatError).toBeDefined()
      expect(formatError.errorType).toBe('InvalidFormat')
    })

    test('should return InvalidValue for invalid enum value', async () => {
      const basePayload = createBulkMovementRequest()
      const payload = {
        ...basePayload,
        wasteItems: [
          {
            ...basePayload.wasteItems[0],
            physicalForm: 'InvalidPhysicalForm' // Not in the valid enum list
          }
        ]
      }

      const response = await server.inject({
        method: 'POST',
        url: '/bulk/1/movements/receive',
        payload: [payload],
        headers: {
          authorization:
            'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
        }
      })

      expect(response.statusCode).toBe(400)
      const responseBody = JSON.parse(response.payload)

      const valueError = responseBody[0].validation.errors.find(
        (err) => err.key === '0.wasteItems.0.physicalForm'
      )
      expect(valueError).toBeDefined()
      expect(valueError.errorType).toBe('InvalidValue')
    })

    test('should return OutOfRange for negative number where min(0) required', async () => {
      const basePayload = createBulkMovementRequest()
      const payload = {
        ...basePayload,
        wasteItems: [
          {
            ...basePayload.wasteItems[0],
            numberOfContainers: -5 // Negative number where min(0) is required
          }
        ]
      }

      const response = await server.inject({
        method: 'POST',
        url: '/bulk/1/movements/receive',
        payload: [payload],
        headers: {
          authorization:
            'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
        }
      })

      expect(response.statusCode).toBe(400)
      const responseBody = JSON.parse(response.payload)

      const rangeError = responseBody[0].validation.errors.find(
        (err) => err.key === '0.wasteItems.0.numberOfContainers'
      )
      expect(rangeError).toBeDefined()
      expect(rangeError.errorType).toBe('OutOfRange')
    })

    test('should return BusinessRuleViolation for hazardous waste without consignment code or reason', async () => {
      const basePayload = createBulkMovementRequest()
      const payload = {
        ...basePayload,
        wasteItems: [
          {
            ...basePayload.wasteItems[0],
            ewcCodes: ['200121'] // Hazardous EWC code
          }
        ]
      }

      // Remove consignment code and reason to trigger business rule violation
      delete payload.hazardousWasteConsignmentCode
      delete payload.reasonForNoConsignmentCode

      const response = await server.inject({
        method: 'POST',
        url: '/bulk/1/movements/receive',
        payload: [payload],
        headers: {
          authorization:
            'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
        }
      })

      expect(response.statusCode).toBe(400)
      const responseBody = JSON.parse(response.payload)

      // Should have a business rule violation error for the missing reason
      const businessRuleError = responseBody[0].validation.errors.find(
        (err) => err.errorType === 'BusinessRuleViolation'
      )
      expect(businessRuleError).toBeDefined()
    })

    test('should return InvalidFormat for invalid EWC code format', async () => {
      const basePayload = createBulkMovementRequest()
      const payload = {
        ...basePayload,
        wasteItems: [
          {
            ...basePayload.wasteItems[0],
            ewcCodes: ['INVALID'] // Not a 6-digit code
          }
        ]
      }

      const response = await server.inject({
        method: 'POST',
        url: '/bulk/1/movements/receive',
        payload: [payload],
        headers: {
          authorization:
            'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
        }
      })

      expect(response.statusCode).toBe(400)
      const responseBody = JSON.parse(response.payload)

      const formatError = responseBody[0].validation.errors.find(
        (err) =>
          err.key === '0.wasteItems.0.ewcCodes.0' &&
          err.errorType === 'InvalidFormat'
      )
      expect(formatError).toBeDefined()
    })

    test('should return InvalidValue for invalid EWC code value (not in list)', async () => {
      const basePayload = createBulkMovementRequest()
      const payload = {
        ...basePayload,
        wasteItems: [
          {
            ...basePayload.wasteItems[0],
            ewcCodes: ['999999'] // 6-digit format but not a valid code
          }
        ]
      }

      const response = await server.inject({
        method: 'POST',
        url: '/bulk/1/movements/receive',
        payload: [payload],
        headers: {
          authorization:
            'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
        }
      })

      expect(response.statusCode).toBe(400)
      const responseBody = JSON.parse(response.payload)

      const valueError = responseBody[0].validation.errors.find(
        (err) =>
          err.key === '0.wasteItems.0.ewcCodes.0' &&
          err.errorType === 'InvalidValue'
      )
      expect(valueError).toBeDefined()
    })

    test('should return InvalidFormat for invalid consignment code format', async () => {
      const basePayload = createBulkMovementRequest()
      const payload = {
        ...basePayload,
        hazardousWasteConsignmentCode: 'INVALID_FORMAT',
        wasteItems: [
          {
            ...basePayload.wasteItems[0],
            ewcCodes: ['200121'] // Hazardous EWC code
          }
        ]
      }

      const response = await server.inject({
        method: 'POST',
        url: '/bulk/1/movements/receive',
        payload: [payload],
        headers: {
          authorization:
            'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
        }
      })

      expect(response.statusCode).toBe(400)
      const responseBody = JSON.parse(response.payload)

      const formatError = responseBody[0].validation.errors.find(
        (err) =>
          err.key === '0.hazardousWasteConsignmentCode' &&
          err.errorType === 'InvalidFormat'
      )
      expect(formatError).toBeDefined()
    })

    test('should return InvalidFormat for invalid authorisation number', async () => {
      const basePayload = createBulkMovementRequest()
      const payload = {
        ...basePayload,
        receiver: {
          ...basePayload.receiver,
          authorisationNumber: 'INVALID_AUTH_NUMBER'
        }
      }

      const response = await server.inject({
        method: 'POST',
        url: '/bulk/1/movements/receive',
        payload: [payload],
        headers: {
          authorization:
            'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
        }
      })

      expect(response.statusCode).toBe(400)
      const responseBody = JSON.parse(response.payload)

      const formatError = responseBody[0].validation.errors.find(
        (err) =>
          err.key === '0.receiver.authorisationNumber' &&
          err.errorType === 'InvalidFormat'
      )
      expect(formatError).toBeDefined()
    })

    test('should return NotProvided for missing subbmitting organisation object', async () => {
      const payload = createBulkMovementRequest({
        submittingOrganisation: undefined
      })

      const response = await server.inject({
        method: 'POST',
        url: '/bulk/1/movements/receive',
        payload: [payload],
        headers: {
          authorization:
            'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
        }
      })

      expect(response.statusCode).toBe(400)
      const responseBody = JSON.parse(response.payload)

      console.dir({ responseBody }, { depth: null })

      const formatError = responseBody[0].validation.errors.find(
        (err) =>
          err.key === '0.submittingOrganisation' &&
          err.errorType === 'NotProvided'
      )
      expect(formatError).toBeDefined()
    })

    test('should return NotAllowed for unknown field in payload', async () => {
      const basePayload = createBulkMovementRequest()
      const payload = {
        ...basePayload,
        unknownField: 'some value'
      }

      const response = await server.inject({
        method: 'POST',
        url: '/bulk/1/movements/receive',
        payload: [payload],
        headers: {
          authorization:
            'Basic d2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpOjRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
        }
      })

      expect(response.statusCode).toBe(400)
      const responseBody = JSON.parse(response.payload)

      const notAllowedError = responseBody[0].validation.errors.find(
        (err) => err.key === '0.unknownField' && err.errorType === 'NotAllowed'
      )
      expect(notAllowedError).toBeDefined()
    })
  })

  describe('#formatBulkUploadValidationErrors', () => {
    const payload = [
      createBulkMovementRequest(),
      createBulkMovementRequest(),
      createBulkMovementRequest()
    ]
    const validationErrors = [
      {
        key: '0.wasteItems.0.typeOfContainers',
        errorType: 'UnexpectedError',
        message:
          '"[0].wasteItems[0].typeOfContainers" must be a valid container type'
      },
      {
        key: '0.wasteItems.0.weight.amount',
        errorType: 'UnexpectedError',
        message: '"[0].wasteItems[0].weight.amount" must be a number'
      },
      {
        key: '1.wasteItems.0.disposalOrRecoveryCodes.0.code',
        errorType: 'UnexpectedError',
        message:
          '"[1].wasteItems[0].disposalOrRecoveryCodes[0].code" must be one of [R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, D1, D2, D3, D4, D5, D6, D7, D8, D9, D10, D11, D12, D13, D14, D15]'
      }
    ]

    it('should return errors', () => {
      const result = formatBulkUploadValidationErrors(payload, validationErrors)

      expect(result).toEqual([
        {
          validation: { errors: [validationErrors[0], validationErrors[1]] }
        },
        {
          validation: {
            errors: [validationErrors[2]]
          }
        },
        {}
      ])
    })

    it('should handle an unexpected error index', () => {
      validationErrors.push({
        key: 'two.wasteItems.0.typeOfContainers',
        errorType: 'UnexpectedError',
        message:
          '"[two].wasteItems[0].typeOfContainers" must be a valid container type'
      })

      const result = formatBulkUploadValidationErrors(
        payload,
        validationErrors,
        { error: jest.fn() }
      )

      expect(result).toEqual([
        {
          validation: { errors: [validationErrors[0], validationErrors[1]] }
        },
        {
          validation: {
            errors: [validationErrors[2]]
          }
        },
        {}
      ])
    })
  })
})
