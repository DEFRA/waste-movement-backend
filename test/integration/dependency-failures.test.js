import { expect, describe, beforeAll, afterAll, it } from '@jest/globals'
import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { startTestService } from './helpers/test-service.js'
import { createWasteTrackingStub } from './helpers/waste-tracking-stub.js'
import { httpRequest } from './helpers/http.js'
import { createBulkMovementRequest } from '../../src/test/utils/createBulkMovementRequest.js'
import { apiCode1 } from '../../src/test/data/apiCodes.js'
import { PROBLEM_TYPE_BASE } from './helpers/problem-types.js'

const bulkId = 'integration-dependency-failure-bulk-id'

// Isolated in its own file: forcing waste-tracking-id-backend failures is
// shared, process-wide state, and each case pays for several seconds of
// retries, so this is kept to the minimum needed to prove failures actually
// propagate as HTTP errors rather than being silently swallowed.
describe('dependency failures', () => {
  let testService
  let wasteTrackingStub

  beforeAll(async () => {
    wasteTrackingStub = createWasteTrackingStub()
    await wasteTrackingStub.start()
    testService = await startTestService({
      wasteTrackingUrl: wasteTrackingStub.baseUrl
    })
  })

  afterAll(async () => {
    await testService.stop()
    await wasteTrackingStub.stop()
  })

  it('POST /bulk/{bulkId}/movements/receive returns 500 when GET /next fails for one of the batch', async () => {
    // A 500 with no body doesn't itself make the HTTP client throw (Wreck
    // only rejects on network-level errors, not non-2xx statuses) - it
    // surfaces here because movement-create-bulk.js refuses to persist a
    // batch where any item is missing the wasteTrackingId that call would
    // have minted, and that check is retried by the route's own backOff.
    wasteTrackingStub.respondWith({ statusCode: 500 })

    const { status, body } = await httpRequest(
      testService.baseUrl,
      `/bulk/${bulkId}/movements/receive`,
      {
        method: 'POST',
        body: [createBulkMovementRequest(), createBulkMovementRequest()]
      }
    )

    wasteTrackingStub.respondWith()

    expect(status).toEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR)
    expect(body).toEqual({
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      error: 'Error',
      message: `Failed to create waste inputs: Not all waste inputs with bulk id (${bulkId}) have a waste tracking id`
    })
  }, 10000)

  it('POST /beta-1/movements returns a Bad Gateway when waste-tracking-id-backend is unreachable', async () => {
    // A genuine connection failure, unlike a 500 response, does make the
    // HTTP client's own retries throw - the only way to exercise the
    // failure path for a beta-1 id-minting call, which isn't wrapped in
    // the route's backOff the way the persistence call is.
    await wasteTrackingStub.stop()

    const { status, body } = await httpRequest(
      testService.baseUrl,
      '/beta-1/movements',
      {
        method: 'POST',
        body: { apiCode: apiCode1 },
        requestId: 'test-trace-dependency-failure'
      }
    )

    await wasteTrackingStub.start()

    expect(status).toEqual(HTTP_STATUS.BAD_GATEWAY)
    expect(body).toEqual({
      type: `${PROBLEM_TYPE_BASE}/bad-gateway`,
      title: 'Bad Gateway',
      detail: expect.any(String),
      instance: '/beta-1/movements',
      requestId: 'test-trace-dependency-failure'
    })
  }, 10000)
})
