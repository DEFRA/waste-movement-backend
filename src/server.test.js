import { HTTP_STATUS } from '@defra/waste-movement-utils'
import { config } from './config.js'
import { createServer } from './server.js'

jest.mock('@defra/cdp-auditing', () => ({
  audit: jest.fn().mockReturnValue(true)
}))

describe('Server', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
  })

  afterAll(async () => {
    await server.stop()
  })

  describe('RFC 9457 error formatting', () => {
    it('formats errors on beta paths as problem details with the docs type base', async () => {
      const expectedTypeBase =
        'https://defra.github.io/digital-waste-tracking-api-docs/preview/problems/'
      const { statusCode, headers, payload } = await server.inject({
        method: 'GET',
        url: '/beta-2/does-not-exist'
      })

      expect(statusCode).toBe(HTTP_STATUS.NOT_FOUND)
      expect(headers['content-type']).toEqual('application/problem+json')
      expect(JSON.parse(payload)).toMatchObject({
        type: `${expectedTypeBase}not-found`,
        title: 'Not Found',
        instance: '/beta-2/does-not-exist'
      })
    })

    it('does not format errors on non-beta paths', async () => {
      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: '/does-not-exist'
      })

      expect(statusCode).toBe(HTTP_STATUS.NOT_FOUND)
      expect(headers['content-type']).not.toContain('application/problem+json')
    })

    it('uses the problem type base from config', async () => {
      const originalTypeBase = config.get('problemDetails.typeBase')
      config.set('problemDetails.typeBase', 'https://example.com/problems/')
      const configuredServer = await createServer()

      try {
        const { payload } = await configuredServer.inject({
          method: 'GET',
          url: '/beta-2/does-not-exist'
        })

        expect(JSON.parse(payload).type).toBe(
          'https://example.com/problems/not-found'
        )
      } finally {
        config.set('problemDetails.typeBase', originalTypeBase)
        await configuredServer.stop()
      }
    })
  })

  describe('response contracts', () => {
    const isBetaRoute = (route) => /^\/beta-\d+\//.test(route.path)

    it('declares a 201 response schema on every beta route', () => {
      const betaRoutes = server.table().filter(isBetaRoute)

      expect(betaRoutes).toHaveLength(10)
      for (const route of betaRoutes) {
        expect({
          route: `${route.method} ${route.path}`,
          validator: typeof route.settings.response?.status?.[201]
        }).toEqual({
          route: `${route.method} ${route.path}`,
          validator: 'function'
        })
      }
    })

    // Beta response validation is declared per route. Some legacy routes
    // (health, bulk) carry their own Joi response schemas, so the guard is on
    // the server-wide default rather than on every non-beta route.
    it('sets no server-wide response schema default', () => {
      expect(server.settings.routes?.response?.status).toBeUndefined()
    })
  })
})
