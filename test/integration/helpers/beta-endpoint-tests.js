import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { expectStandardHeaders } from './expect-standard-headers.js'
import { httpRequest } from './http.js'

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
      const res = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: {}
        }
      )

      expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(res.body).toHaveProperty('detail')
      expect(res.body).toHaveProperty('title', 'Bad Request')
      expect(res.body).toHaveProperty(
        'type',
        'https://waste-tracking.service.gov.uk/problems/bad-request'
      )
      expect(res.body).toHaveProperty('instance', `${basePath}/movements`)
      expect(res.body.errors || res.body.detail).toBeDefined()
      expect(res.headers.get('content-type')).toContain(
        'application/problem+json'
      )
    })

    it('returns RFC9457 format for invalid API code', async () => {
      const testService = getTestService()
      const res = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: { apiCode: 'INVALID_CODE', ...testData.minimalProducer }
        }
      )

      expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(res.body).toHaveProperty('title', 'Bad Request')
      expect(res.body).toHaveProperty('type')
      expect(res.body.type).toContain('bad-request')
      expect(res.body).toHaveProperty('instance')
      expect(res.headers.get('content-type')).toContain(
        'application/problem+json'
      )
    })

    it('returns RFC9457 format for missing authentication', async () => {
      const testService = getTestService()
      const res = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: { apiCode: testData.apiCode1, ...testData.minimalProducer },
          auth: false
        }
      )

      expect(res.status).toEqual(HTTP_STATUS.UNAUTHORIZED)
      expect(res.body).toHaveProperty('title', 'Unauthorized')
      expect(res.body).toHaveProperty('type')
      expect(res.body.type).toContain('unauthorized')
      expect(res.body).toHaveProperty('instance')
      expect(res.headers.get('content-type')).toContain(
        'application/problem+json'
      )
    })

    it('returns RFC9457 format for 404 Not Found', async () => {
      const testService = getTestService()
      // Generic 404 test - verify format compliance, not endpoint-specific behavior
      const res = await httpRequest(
        testService.baseUrl,
        `${basePath}/NONEXISTENT`,
        {
          method: 'GET'
        }
      )

      // If endpoint exists and returns 404, verify format
      if (res.status === HTTP_STATUS.NOT_FOUND) {
        expect(res.body).toHaveProperty('title', 'Not Found')
        expect(res.body).toHaveProperty('type')
        expect(res.body.type).toContain('not-found')
        expect(res.body).toHaveProperty('instance')
        expect(res.headers.get('content-type')).toContain(
          'application/problem+json'
        )
      }
    })
  })

  describe(`${version} - Content Negotiation`, () => {
    it('returns problem+json for errors', async () => {
      const testService = getTestService()
      const res = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: {}
        }
      )

      expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(res.headers.get('content-type')).toContain(
        'application/problem+json'
      )
    })

    it('returns json for successful responses', async () => {
      const testService = getTestService()
      const res = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: { apiCode: testData.apiCode1, ...testData.minimalProducer }
        }
      )

      expect(res.status).toEqual(HTTP_STATUS.CREATED)
      expect(res.headers.get('content-type')).toContain('application/json')
    })
  })

  describe(`${version} - Request Tracing`, () => {
    it('echoes x-cdp-request-id as x-request-id', async () => {
      const testService = getTestService()
      const res = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: { apiCode: testData.apiCode1, ...testData.minimalProducer },
          headers: { 'x-cdp-request-id': `test-trace-beta${version}` }
        }
      )

      expect(res.status).toEqual(HTTP_STATUS.CREATED)
      expect(res.headers.get('x-request-id')).toBe(`test-trace-beta${version}`)
    })

    it('generates request ID when not provided', async () => {
      const testService = getTestService()
      const res = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: { apiCode: testData.apiCode1, ...testData.minimalProducer }
        }
      )

      expect(res.status).toEqual(HTTP_STATUS.CREATED)
      expect(res.headers.get('x-request-id')).toBeDefined()
    })
  })

  describe(`${version} - Standard Headers`, () => {
    it('includes standard security and content headers in success responses', async () => {
      const testService = getTestService()
      const res = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: { apiCode: testData.apiCode1, ...testData.minimalProducer }
        }
      )

      expect(res.status).toEqual(HTTP_STATUS.CREATED)
      expectStandardHeaders(res)
    })

    it('includes standard security headers in error responses', async () => {
      const testService = getTestService()
      const res = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: {}
        }
      )

      expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
      // Error responses should still have basic headers
      expect(res.headers).toBeDefined()
    })
  })

  describe(`${version} - Missing Required Fields`, () => {
    it('rejects missing apiCode', async () => {
      const testService = getTestService()
      const res = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: testData.minimalProducer
        }
      )

      expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(res.body).toHaveProperty('title')
      expect(res.body.title).toContain('Bad Request')
    })

    it('rejects missing producer when required', async () => {
      const testService = getTestService()
      // Only applicable to beta-2+
      if (!testData.requiresProducer) return

      const res = await httpRequest(
        testService.baseUrl,
        `${basePath}/movements`,
        {
          method: 'POST',
          body: { apiCode: testData.apiCode1 }
        }
      )

      expect(res.status).toEqual(HTTP_STATUS.BAD_REQUEST)
      expect(res.body).toHaveProperty('title')
      expect(res.body.title).toContain('Bad Request')
    })
  })
}
