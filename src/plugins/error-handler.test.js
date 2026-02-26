import { config } from '../config.js'
import { createServer } from '../server.js'
import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'
import { apiCode1, base64EncodedOrgApiCodes } from '../test/data/apiCodes.js'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { createBulkMovementRequest } from '../test/utils/createBulkMovementRequest.js'
import { formatBulkUploadValidationErrors } from './error-handler.js'

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
    config.set('orgApiCodes', base64EncodedOrgApiCodes)
    process.env = {
      ACCESS_CRED_WASTE_MOVEMENT_EXTERNAL_API:
        'd2FzdGUtbW92ZW1lbnQtZXh0ZXJuYWwtYXBpPTRkNWQ0OGNiLTQ1NmEtNDcwYS04ODE0LWVhZTI3NThiZTkwZA=='
    }

    server = await createServer()

    const createResult = await server.inject({
      method: 'POST',
      url: `/movements/${wasteTrackingId}/receive`,
      payload: {
        movement: {
          receivingSiteId: 'test-create',
          receiverReference: 'test-create',
          specialHandlingRequirements: 'test-create',
          apiCode: apiCode1
        }
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
            errorType: 'NotProvided',
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
              errorType: 'UnexpectedError',
              key: '1.submittingOrganisation.defraCustomerOrganisationId',
              message:
                '"[1].submittingOrganisation.defraCustomerOrganisationId" is required'
            },
            {
              errorType: 'UnexpectedError',
              key: '1.dateTimeReceived',
              message: '"[1].dateTimeReceived" is required'
            }
          ]
        }
      }
    ])
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
      key: '1'
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
            errorType: 'UnexpectedError',
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
            errorType: 'UnexpectedError',
            key: 'revision',
            message: '"revision" must be a number'
          }
        ]
      }
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
