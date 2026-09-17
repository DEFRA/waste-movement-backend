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

    const res = await httpRequest(
      testService.baseUrl,
      `/movements/${wasteTrackingId}/receive`,
      {
        method: 'POST',
        headers: { 'x-dwt-client-id': clientId },
        body: { movement: createTestPayload() }
      }
    )

    expect(res.status).toEqual(HTTP_STATUS.NO_CONTENT)
    expectStandardHeaders(res)

    const persisted = await testService.db
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })

    expect(persisted.wasteTrackingId).toEqual(wasteTrackingId)
    expect(persisted.revision).toEqual(1)
  })

  it('PUT /movements/{wasteTrackingId}/receive updates an existing waste input', async () => {
    const wasteTrackingId = generateWasteTrackingId()

    const createRes = await httpRequest(
      testService.baseUrl,
      `/movements/${wasteTrackingId}/receive`,
      {
        method: 'POST',
        headers: { 'x-dwt-client-id': clientId },
        body: { movement: createTestPayload() }
      }
    )
    expect(createRes.status).toEqual(HTTP_STATUS.NO_CONTENT)

    const updateRes = await httpRequest(
      testService.baseUrl,
      `/movements/${wasteTrackingId}/receive`,
      {
        method: 'PUT',
        headers: { 'x-dwt-client-id': clientId },
        body: { movement: createTestPayload() }
      }
    )

    expect(updateRes.status).toEqual(HTTP_STATUS.OK)
    expectStandardHeaders(updateRes)

    const persisted = await testService.db
      .collection('waste-inputs')
      .findOne({ _id: wasteTrackingId })

    expect(persisted.revision).toEqual(2)
  })

  it('POST /movements/retry-audit-log retries sending a movement to the audit log', async () => {
    const wasteTrackingId = generateWasteTrackingId()
    const traceId = 'retry-audit-log-trace-id'

    const createRes = await httpRequest(
      testService.baseUrl,
      `/movements/${wasteTrackingId}/receive`,
      {
        method: 'POST',
        headers: { 'x-cdp-request-id': traceId, 'x-dwt-client-id': clientId },
        body: { movement: createTestPayload() }
      }
    )
    expect(createRes.status).toEqual(HTTP_STATUS.NO_CONTENT)

    const res = await httpRequest(
      testService.baseUrl,
      '/movements/retry-audit-log',
      {
        method: 'POST',
        body: { traceId }
      }
    )

    expect(res.status).toEqual(HTTP_STATUS.OK)
    expect(res.body).toEqual({})
    expectStandardHeaders(res)
  })

  it('GET /qa-non-prod/movements returns the matching waste inputs', async () => {
    const wasteTrackingId = generateWasteTrackingId()

    const createRes = await httpRequest(
      testService.baseUrl,
      `/movements/${wasteTrackingId}/receive`,
      {
        method: 'POST',
        headers: { 'x-dwt-client-id': clientId },
        body: { movement: createTestPayload() }
      }
    )
    expect(createRes.status).toEqual(HTTP_STATUS.NO_CONTENT)

    const res = await httpRequest(
      testService.baseUrl,
      `/qa-non-prod/movements?wasteTrackingId=${wasteTrackingId}`
    )

    expect(res.status).toEqual(HTTP_STATUS.OK)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].wasteTrackingId).toEqual(wasteTrackingId)
    expectStandardHeaders(res)
  })
})
