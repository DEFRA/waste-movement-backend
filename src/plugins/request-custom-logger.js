import { AsyncLocalStorage } from 'node:async_hooks'
import { config } from '../config.js'
import { ORGANISATION_ID_HEADER } from '../common/helpers/get-organisation-id.js'

const asyncLocalStorage = new AsyncLocalStorage()

/**
 * Return's the request's client id, if set else null.
 * @return {string|null}
 */
const getClientId = () => asyncLocalStorage.getStore()?.get('clientId') ?? null
const getClientName = () =>
  asyncLocalStorage.getStore()?.get('clientName') ?? null
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
      server.ext('onRequest', (request, h) => {
        const store = new Map()
        // Beta routes: the organisation the external API resolved for the
        // apiCode. Set here, not onPreHandler, so lines logged before the
        // handler (e.g. validation errors) carry it too.
        const forwardedOrganisationId = request.headers[ORGANISATION_ID_HEADER]
        if (forwardedOrganisationId) {
          store.set('organisationId', forwardedOrganisationId)
        }

        request.app.metaStore = store
        wrapLifecycle(request, store)
        return h.continue
      })

      server.ext('onPreHandler', (request, h) => {
        const store = request.app.metaStore

        if (!store) {
          return h.continue
        }

        const softwareProvider = request.payload?.movement?.softwareProvider
        if (softwareProvider) {
          store.set('clientId', softwareProvider.id)
          store.set('clientName', softwareProvider.name)
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
}

export { requestCustomLogger, getClientId, getClientName, getOrganisationId }
