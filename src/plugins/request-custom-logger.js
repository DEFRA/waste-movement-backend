import { AsyncLocalStorage } from 'node:async_hooks'
import { config } from '../config.js'
import { ORGANISATION_ID_HEADER } from '../common/helpers/get-organisation-id.js'

const asyncLocalStorage = new AsyncLocalStorage()

/**
 * Header the external API uses to forward the caller's client name on beta
 * routes, URI-encoded.
 */
const CLIENT_NAME_HEADER = 'x-dwt-client-name'

const isBetaRoute = (request) => request.path.startsWith('/beta-')

/**
 * Return's the request's client id, if set else null.
 * @return {string|null}
 */
const getClientId = () => asyncLocalStorage.getStore()?.get('clientId')
/**
 * Return's the request's client name, if set else null. Only set on beta
 * routes.
 * @return {string|null}
 */
const getClientName = () => asyncLocalStorage.getStore()?.get('clientName')
/**
 * Return's the request's organisation id, if set else null.
 * @return {string|null}
 */
const getOrganisationId = () =>
  asyncLocalStorage.getStore()?.get('organisationId')

/**
 * Wrap a request cycle in an asyncLocalStorage run call. This allows the
 * passed store to be available during that part of the request.
 * @param { Request } request
 * @param { '_lifecycle'|'_postCycle'|'_finalize' } cycle
 * @param { Map<string, string> } store
 */
function wrapCycle(request, cycle, store) {
  const requestCycle = request[cycle].bind(request)
  request[cycle] = () => asyncLocalStorage.run(store, requestCycle)
}

const decodeClientName = (value) => {
  try {
    return value ? decodeURIComponent(value) : undefined
  } catch {
    return undefined
  }
}

/**
 * @satisfies {Plugin}
 */
const requestCustomLogger = {
  plugin: {
    name: 'request-custom-logger',
    version: '0.1.0',
    once: true,
    register(server, options) {
      if (options.clientId) {
        server.ext('onRequest', (request, h) => {
          const store = new Map()
          const clientIdHeader = options?.clientId
          const xDwtClientId = request.headers[clientIdHeader]
          store.set('clientId', xDwtClientId)

          // Beta routes: the organisation the external API resolved for the
          // apiCode. Set here, not onPreHandler, so lines logged before the
          // handler (e.g. validation errors) carry it too.
          const forwardedOrganisationId =
            request.headers[ORGANISATION_ID_HEADER]
          if (forwardedOrganisationId) {
            store.set('organisationId', forwardedOrganisationId)
          }

          wrapCycle(request, '_lifecycle', store)

          // Beta routes only, so RoW logging is unchanged:
          // - the client name the external API forwards, logged with tenant.id
          // - _postCycle (onPreResponse, e.g. "Request error") and _finalize
          //   (hapi-pino's "request completed" line) also see the store
          if (isBetaRoute(request)) {
            const clientName = decodeClientName(
              request.headers[CLIENT_NAME_HEADER]
            )
            if (clientName) {
              store.set('clientName', clientName)
            }
            wrapCycle(request, '_postCycle', store)
            wrapCycle(request, '_finalize', store)
          }
          return h.continue
        })

        server.ext('onPreHandler', (request, h) => {
          const store = asyncLocalStorage.getStore()

          if (!store) {
            return h.continue
          }

          const organisationId =
            request.payload?.movement?.submittingOrganisation
              ?.defraCustomerOrganisationId

          if (organisationId == null) {
            const apiCode = request.payload?.movement?.apiCode
            const orgApiCodes = config.get('orgApiCodes')

            const orgId = (orgApiCodes || []).find(
              (orgApiCode) => orgApiCode.apiCode === apiCode
            )?.orgId

            if (orgId) {
              store.set('organisationId', orgId)
            }
          } else {
            store.set('organisationId', organisationId)
          }
          return h.continue
        })
      }
    }
  },
  options: {
    clientId: 'x-dwt-client-id'
  }
}

export {
  requestCustomLogger,
  getClientId,
  getClientName,
  getOrganisationId,
  CLIENT_NAME_HEADER
}
