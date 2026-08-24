import { AsyncLocalStorage } from 'node:async_hooks'
import { config } from '../config.js'

const asyncLocalStorage = new AsyncLocalStorage()

/**
 * Return's the request's client id, if set else null.
 * @return {string|null}
 */
const getClientId = () => asyncLocalStorage.getStore()?.get('clientId')
/**
 * Return's the request's organisation id, if set else null.
 * @return {string|null}
 */
const getOrganisationId = () =>
  asyncLocalStorage.getStore()?.get('organisationId')

/**
 * Wrap the request lifecycle in an asyncLocalStorage run call. This allows the
 * passed store to be available during the request lifecycle.
 * @param { Request } request
 * @param { Map<string, string> } store
 */
function wrapLifecycle(request, store) {
  const requestLifecycle = request._lifecycle.bind(request)
  request._lifecycle = () => asyncLocalStorage.run(store, requestLifecycle)
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
          wrapLifecycle(request, store)
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

export { requestCustomLogger, getClientId, getOrganisationId }
