import { config } from '../config.js'
import { createServer } from '../server.js'
import { generateWasteTrackingId } from '../test/generate-waste-tracking-id.js'
import { apiCode1, base64EncodedOrgApiCodes } from '../test/data/apiCodes.js'
import { HTTP_STATUS_CODES } from '../common/constants/http-status-codes.js'
import { createBulkMovementRequest } from '../test/utils/createBulkMovementRequest.js'

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
          submittingOrganisation: undefined,
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
              key: '1.dateTimeReceived',
              message: '"[1].dateTimeReceived" is required'
            },
            {
              errorType: 'UnexpectedError',
              key: '1.submittingOrganisation',
              message: '"[1].submittingOrganisation" is required'
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
})
