import Hapi from '@hapi/hapi'
import { config } from '../config.js'
import {
  CLIENT_NAME_HEADER,
  getClientId,
  getClientName,
  getOrganisationId,
  requestCustomLogger
} from './request-custom-logger.js'
import {
  apiCode1,
  base64EncodedOrgApiCodes,
  orgId1
} from '../test/data/apiCodes.js'
import {
  forwardedOrganisationId,
  organisationHeaders
} from '../test/data/organisation-headers.js'

describe('requestCustomLogger', () => {
  let server
  let beforeHandler

  beforeAll(async () => {
    config.set('orgApiCodes', base64EncodedOrgApiCodes)

    server = Hapi.server()
    await server.register(requestCustomLogger)

    // What a log line written before the handler (e.g. a validation error)
    // would see
    server.ext('onPostAuth', (_request, h) => {
      beforeHandler = getOrganisationId()
      return h.continue
    })

    const handler = () => ({
      organisationId: getOrganisationId() ?? null,
      clientId: getClientId() ?? null,
      clientName: getClientName() ?? null
    })

    server.route({ method: 'POST', path: '/test', handler })
    server.route({ method: 'POST', path: '/beta-1/test', handler })
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(() => {
    beforeHandler = undefined
  })

  const inject = (payload, headers = {}) =>
    server.inject({ method: 'POST', url: '/test', payload, headers })

  it('stores the client details from movement', async () => {
    const { result } = await inject({
      movement: { softwareProvider: { id: 'client-123', name: 'Client 123' } }
    })

    expect(result.clientId).toEqual('client-123')
    expect(result.clientName).toEqual('Client 123')
  })

  describe('beta requests', () => {
    it('stores the organisation forwarded by the external API', async () => {
      const { result } = await inject(
        { apiCode: apiCode1 },
        organisationHeaders
      )

      expect(result.organisationId).toEqual(forwardedOrganisationId)
    })

    it('stores it before the handler runs, for lines logged earlier in the request', async () => {
      await inject({ apiCode: apiCode1 }, organisationHeaders)

      expect(beforeHandler).toEqual(forwardedOrganisationId)
    })

    it('stores no organisation when none was forwarded, even if the apiCode is in ORG_API_CODES', async () => {
      const { result } = await inject({ apiCode: apiCode1 })

      expect(result.organisationId).toBeNull()
    })
  })

  describe('receipt of waste requests (unchanged)', () => {
    it('stores the submitting organisation from the payload', async () => {
      const { result } = await inject({
        movement: {
          submittingOrganisation: { defraCustomerOrganisationId: 'row-org-id' }
        }
      })

      expect(result.organisationId).toEqual('row-org-id')
    })

    it('falls back to ORG_API_CODES for the apiCode in the payload', async () => {
      const { result } = await inject({ movement: { apiCode: apiCode1 } })

      expect(result.organisationId).toEqual(orgId1)
    })

    it('stores no organisation for an apiCode not in ORG_API_CODES', async () => {
      const { result } = await inject({ movement: { apiCode: 'unknown' } })

      expect(result.organisationId).toBeNull()
    })
  })

  describe('client name', () => {
    const injectAt = (url, headers) =>
      server.inject({ method: 'POST', url, payload: {}, headers })

    it('stores the client name forwarded by the external API on beta routes, decoded', async () => {
      const { result } = await injectAt('/beta-1/test', {
        [CLIENT_NAME_HEADER]: encodeURIComponent('Débora & Co')
      })

      expect(result.clientName).toEqual('Débora & Co')
    })

    it('ignores a malformed client name header', async () => {
      const { result } = await injectAt('/beta-1/test', {
        [CLIENT_NAME_HEADER]: '%E0%A4%A'
      })

      expect(result.clientName).toBeNull()
    })

    it('ignores the client name header on receipt of waste routes (unchanged)', async () => {
      const { result } = await injectAt('/test', {
        [CLIENT_NAME_HEADER]: 'Acme%20Ltd'
      })

      expect(result.clientName).toBeNull()
    })
    it('stores the client id and name from softwareProvider in the movement', async () => {
      const { result } = await inject({
        movement: {
          softwareProvider: {
            id: 'client-123',
            name: 'Client 123'
          }
        }
      })

      expect(result.clientId).toEqual('client-123')
      expect(result.clientName).toEqual('Client 123')
    })
    it('does not set client details when softwareProvider is not present', async () => {
      const { result } = await inject({
        movement: {}
      })

      expect(result.clientId).toBeNull()
      expect(result.clientName).toBeNull()
    })
  })
})
