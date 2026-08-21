import { AsyncLocalStorage } from 'node:async_hooks'

const asyncLocalStorage = new AsyncLocalStorage()

/**
 * Return's the request's trace id, if set else null.
 * @return {string|null}
 */
const getClientId = () => asyncLocalStorage.getStore()?.get('clientId')

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
const logging = {
  plugin: {
    name: 'logging',
    version: '0.1.0',
    once: true,
    register(server, options) {
      if (options.clientId) {
        server.ext('onRequest', (request, h) => {
          const store = new Map()
          const clientId = options?.clientId
          const xDwtClientId = request.headers[clientId]
          store.set('clientId', xDwtClientId)
          wrapLifecycle(request, store)
          return h.continue
        })
      }
    }
  },
  options: {
    clientId: 'x-dwt-client-id'
  }
}

export { logging, getClientId }
