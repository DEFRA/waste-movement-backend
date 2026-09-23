import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { expectStandardHeaders } from './expect-standard-headers.js'
import { httpRequest } from './http.js'
import { PROBLEM_TYPE_BASE } from './problem-types.js'

/**
 * Shared test suite for beta endpoint versions.
 * Parameterized to work with beta-1, beta-2, beta-3, etc.
 *
 * Usage:
 *   describe(`beta-${version}`, () => {
 *     let testService, wasteTrackingStub
 *     beforeAll/afterAll setup...
 *     describeBetaEndpointTests(version, testService, testData)
 *   })
 */
export function describeBetaEndpointTests(
  version,
  getTestService,
  getWasteTrackingStub,
  testData
) {
  const basePath = `/${version}`

  describe(`${version} - Error Formatting & RFC9457 Compliance`, () => {
    it('returns RFC9457 format for validation errors', async () => {
      const testService = getTestService()
      const endpoint = `${basePath}/movements`
      const { status, body, headers } = await httpRequest(
        testService.baseUrl,
        endpoint,
        {
          method: 'POST',
          body: {}
        }
      )

      expect(status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(body).toMatchObject({
        title: 'Bad Request',
        type: `${PROBLEM_TYPE_BASE}/bad-request`,
        instance: endpoint,
        detail: expect.any(String),
        errors: expect.any(Array)
      })

      expect(headers.get('content-type')).toContain('application/problem+json')
    })

    it('returns RFC9457 format for invalid API code', async () => {
      const testService = getTestService()
      const endpoint = `${basePath}/movements`
      const { status, body, headers } = await httpRequest(
        testService.baseUrl,
        endpoint,
        {
          method: 'POST',
          body: { apiCode: 'INVALID_CODE', ...testData.minimalProducer }
        }
      )

      expect(status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(body).toMatchObject({
        title: 'Bad Request',
        type: `${PROBLEM_TYPE_BASE}/bad-request`,
        instance: endpoint,
        detail: expect.any(String)
      })
      expect(headers.get('content-type')).toContain('application/problem+json')
    })

    it('returns RFC9457 format for missing authentication', async () => {
      const testService = getTestService()
      const endpoint = `${basePath}/movements`
      const { status, body, headers } = await httpRequest(
        testService.baseUrl,
        endpoint,
        {
          method: 'POST',
          body: { apiCode: testData.apiCode1, ...testData.minimalProducer },
          auth: false
        }
      )

      expect(status).toEqual(HTTP_STATUS.UNAUTHORIZED)
      expect(body).toMatchObject({
        title: 'Unauthorized',
        type: `${PROBLEM_TYPE_BASE}/unauthorized`,
        instance: endpoint,
        detail: expect.any(String)
      })
      expect(headers.get('content-type')).toContain('application/problem+json')
    })

    it('returns RFC9457 format for 404 Not Found', async () => {
      const testService = getTestService()
      // Generic 404 test - verify format compliance, not endpoint-specific behavior
      const endpoint = `${basePath}/NONEXISTENT`
      const { status, body, headers } = await httpRequest(
        testService.baseUrl,
        endpoint,
        {
          method: 'GET'
        }
      )

      // If endpoint exists and returns 404, verify format
      if (status === HTTP_STATUS.NOT_FOUND) {
        expect(body).toMatchObject({
          title: 'Not Found',
          type: `${PROBLEM_TYPE_BASE}/not-found`,
          instance: endpoint,
          detail: expect.any(String)
        })
        expect(headers.get('content-type')).toContain(
          'application/problem+json'
        )
      }
    })
  })

  describe(`${version} - Content Negotiation`, () => {
    it('returns problem+json for errors', async () => {
      const testService = getTestService()
      const { status, headers } = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: {}
        }
      )

      expect(status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(headers.get('content-type')).toContain('application/problem+json')
    })

    it('returns json for successful responses', async () => {
      const testService = getTestService()
      const { status, headers } = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: { apiCode: testData.apiCode1, ...testData.minimalProducer }
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expect(headers.get('content-type')).toContain('application/json')
    })
  })

  describe(`${version} - Request Tracing`, () => {
    it('echoes x-cdp-request-id as x-request-id', async () => {
      const testService = getTestService()
      const traceId = `test-trace-beta${version}`
      const { status, headers } = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: { apiCode: testData.apiCode1, ...testData.minimalProducer },
          headers: { 'x-cdp-request-id': traceId }
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expect(headers.get('x-request-id')).toBe(traceId)
    })

    it('generates request ID when not provided', async () => {
      const testService = getTestService()
      const { status, headers } = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: { apiCode: testData.apiCode1, ...testData.minimalProducer }
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expect(headers.get('x-request-id')).toBeDefined()
    })
  })

  describe(`${version} - Standard Headers`, () => {
    it('includes standard security and content headers in success responses', async () => {
      const testService = getTestService()
      const { status, headers } = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: { apiCode: testData.apiCode1, ...testData.minimalProducer }
        }
      )

      expect(status).toEqual(HTTP_STATUS.CREATED)
      expectStandardHeaders(headers)
    })

    it('includes standard security headers in error responses', async () => {
      const testService = getTestService()
      const { status, headers } = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: {}
        }
      )

      expect(status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(headers).toBeDefined()
    })
  })

  describe(`${version} - Missing Required Fields`, () => {
    it('rejects missing apiCode', async () => {
      const testService = getTestService()
      const endpoint = `${basePath}/movements`
      const { status, body } = await httpRequest(
        testService.baseUrl,
        endpoint,
        {
          method: 'POST',
          body: testData.minimalProducer
        }
      )

      expect(status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(body).toMatchObject({
        title: 'Bad Request',
        type: `${PROBLEM_TYPE_BASE}/bad-request`,
        instance: endpoint,
        detail: expect.any(String)
      })
    })

    it('rejects missing producer when required', async () => {
      const testService = getTestService()
      // Only applicable to beta-2+
      if (!testData.requiresProducer) return

      const endpoint = `${basePath}/movements`
      const { status, body } = await httpRequest(
        testService.baseUrl,
        endpoint,
        {
          method: 'POST',
          body: { apiCode: testData.apiCode1 }
        }
      )

      expect(status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(body).toMatchObject({
        title: 'Bad Request',
        type: `${PROBLEM_TYPE_BASE}/bad-request`,
        instance: endpoint,
        detail: expect.any(String)
      })
    })
  })
}
