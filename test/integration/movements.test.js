import { expect, describe, beforeAll, afterAll, it } from '@jest/globals'
import {
  HTTP_STATUS,
  generateWasteTrackingId
} from '@defra/waste-movement-utils'
import { startTestService } from './helpers/test-service.js'
import { httpRequest } from './helpers/http.js'
import { expectStandardHeaders } from './helpers/expect-standard-headers.js'
import { createTestPayload } from '../../src/schemas/test-helpers/waste-test-helpers.js'

const clientId = 'integration-test-client'

describe('movements', () => {
  let testService

  beforeAll(async () => {
    testService = await startTestService()
  })

  afterAll(async () => {
    await testService.stop()
  })

  it('POST /movements/{wasteTrackingId}/receive creates a waste input', async () => {
    const wasteTrackingId = generateWasteTrackingId()

    const { status, headers } = await httpRequest(
      testService.baseUrl,
      `/movements/${wasteTrackingId}/receive`,
      {
        method: 'POST',
        headers: { 'x-dwt-client-id': clientId },
        body: { movement: createTestPayload() }
      }
    )

    expect(status).toEqual(HTTP_STATUS.NO_CONTENT)
    expectStandardHeaders(headers, { contentType: null })

    const persisted = await testService.db
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })

    expect(persisted.wasteTrackingId).toEqual(wasteTrackingId)
    expect(persisted.revision).toEqual(1)
  })

  it('PUT /movements/{wasteTrackingId}/receive updates an existing waste input', async () => {
    const wasteTrackingId = generateWasteTrackingId()

    const { status: createStatus } = await httpRequest(
      testService.baseUrl,
      `/movements/${wasteTrackingId}/receive`,
      {
        method: 'POST',
        headers: { 'x-dwt-client-id': clientId },
        body: { movement: createTestPayload() }
      }
    )
    expect(createStatus).toEqual(HTTP_STATUS.NO_CONTENT)

    const { status, headers } = await httpRequest(
      testService.baseUrl,
      `/movements/${wasteTrackingId}/receive`,
      {
        method: 'PUT',
        headers: { 'x-dwt-client-id': clientId },
        body: { movement: createTestPayload() }
      }
    )

    expect(status).toEqual(HTTP_STATUS.OK)
    expectStandardHeaders(headers, { contentType: null })

    const persisted = await testService.db
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })

    expect(persisted.revision).toEqual(2)
  })

  it('POST /movements/retry-audit-log retries sending a movement to the audit log', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const traceId = 'retry-audit-log-trace-id'

    const { status: createStatus } = await httpRequest(
      testService.baseUrl,
      `/movements/${wasteTrackingId}/receive`,
      {
        method: 'POST',
        requestId: traceId,
        headers: { 'x-dwt-client-id': clientId },
        body: { movement: createTestPayload() }
      }
    )
    expect(createStatus).toEqual(HTTP_STATUS.NO_CONTENT)

    const { status, body, headers } = await httpRequest(
      testService.baseUrl,
      '/movements/retry-audit-log',
      {
        method: 'POST',
        body: { traceId }
      }
    )

    expect(status).toEqual(HTTP_STATUS.OK)
    expect(body).toEqual({})
    expectStandardHeaders(headers)
  })

  it('GET /qa-non-prod/movements returns the matching waste inputs', async () => {
    const wasteTrackingId = generateWasteTrackingId()

    const { status: createStatus } = await httpRequest(
      testService.baseUrl,
      `/movements/${wasteTrackingId}/receive`,
      {
        method: 'POST',
        headers: { 'x-dwt-client-id': clientId },
        body: { movement: createTestPayload() }
      }
    )
    expect(createStatus).toEqual(HTTP_STATUS.NO_CONTENT)

    const { status, body, headers } = await httpRequest(
      testService.baseUrl,
      `/qa-non-prod/movements?wasteTrackingId=${wasteTrackingId}`
    )

    expect(status).toEqual(HTTP_STATUS.OK)
    expect(body).toHaveLength(1)
    expect(body[0].wasteTrackingId).toEqual(wasteTrackingId)
    expectStandardHeaders(headers)
  })
})
