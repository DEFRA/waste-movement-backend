import { expect, describe, beforeAll, afterAll, it } from '@jest/globals'
import {
  HTTP_STATUS,
  generateWasteTrackingId
} from '@defra/waste-movement-utils'
import { startTestService } from './helpers/test-service.js'
import { httpRequest } from './helpers/http.js'
import { expectStandardHeaders } from './helpers/expect-standard-headers.js'
import { createTestPayload } from '../../src/schemas/test-helpers/waste-test-helpers.js'
import { apiCode3 } from '../../src/test/data/apiCodes.js'

const clientId = 'integration-test-client'

describe('errors', () => {
  let testService

  beforeAll(async () => {
    testService = await startTestService()
  })

  afterAll(async () => {
    await testService.stop()
  })

  it('returns 401 when no Authorization header is sent on a protected route', async () => {
    const wasteTrackingId = generateWasteTrackingId()

    const res = await httpRequest(
      testService.baseUrl,
      `/movements/${wasteTrackingId}/receive`,
      {
        method: 'POST',
        auth: false,
        headers: { 'x-dwt-client-id': clientId },
        body: { movement: createTestPayload() }
      }
    )

    expect(res.status).toEqual(HTTP_STATUS.UNAUTHORIZED)
    expect(res.body.message).toEqual('Missing authentication')
    expectStandardHeaders(res)
  })

  it('returns 400 with the validation.errors[] shape when the payload is invalid', async () => {
    const wasteTrackingId = generateWasteTrackingId()

    const res = await httpRequest(
      testService.baseUrl,
      `/movements/${wasteTrackingId}/receive`,
      {
        method: 'POST',
        headers: { 'x-dwt-client-id': clientId },
        body: { movement: { ...createTestPayload(), apiCode: apiCode3 } }
      }
    )

    expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(res.body).toEqual({
      validation: {
        errors: [
          {
            key: 'apiCode',
            errorType: 'InvalidValue',
            message: 'the API Code supplied is invalid'
          }
        ]
      }
    })
    expectStandardHeaders(res)
  })

  it('returns 400 for malformed JSON in the request body', async () => {
    const wasteTrackingId = generateWasteTrackingId()

    const res = await httpRequest(
      testService.baseUrl,
      `/movements/${wasteTrackingId}/receive`,
      {
        method: 'POST',
        headers: { 'x-dwt-client-id': clientId },
        body: '{'
      }
    )

    expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(res.body.validation.errors).toEqual([
      {
        key: 'payload',
        errorType: 'InvalidFormat',
        message: expect.any(String)
      }
    ])
    expectStandardHeaders(res)
  })

  it('returns 404 for an unknown path', async () => {
    const res = await httpRequest(
      testService.baseUrl,
      '/this-route-does-not-exist'
    )

    expect(res.status).toEqual(HTTP_STATUS.NOT_FOUND)
    expectStandardHeaders(res)
  })

  it('returns a BusinessRuleViolation when the submitting organisation does not match the original record', async () => {
    const wasteTrackingId = generateWasteTrackingId()

    const createRes = await httpRequest(
      testService.baseUrl,
      `/movements/${wasteTrackingId}/receive`,
      {
        method: 'POST',
        headers: { 'x-dwt-client-id': clientId },
        body: {
          movement: {
            ...createTestPayload(),
            apiCode: undefined,
            submittingOrganisation: {
              defraCustomerOrganisationId: 'original-org-id'
            }
          }
        }
      }
    )
    expect(createRes.status).toEqual(HTTP_STATUS.NO_CONTENT)

    const res = await httpRequest(
      testService.baseUrl,
      `/movements/${wasteTrackingId}/receive`,
      {
        method: 'PUT',
        headers: { 'x-dwt-client-id': clientId },
        body: {
          movement: {
            ...createTestPayload(),
            apiCode: undefined,
            submittingOrganisation: {
              defraCustomerOrganisationId: 'different-org-id'
            }
          }
        }
      }
    )

    expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
    expect(res.body).toEqual({
      validation: {
        errors: [
          {
            key: 'submittingOrganisation',
            errorType: 'BusinessRuleViolation',
            message:
              'the submitting organisation does not match the Organisation that created the original waste item record'
          }
        ]
      }
    })
    expectStandardHeaders(res)
  })
})
