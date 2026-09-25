import Hapi from '@hapi/hapi'
import { generateWasteTrackingId } from '@defra/waste-movement-utils'

const host = '127.0.0.1'

// A real Hapi server standing in for waste-tracking-id-backend's GET /next -
// the one external dependency this suite doesn't run against the real service.
//
// Binds an ephemeral port on first start; `baseUrl` is available after that.
// A restart after stop() rebinds the same port, since the service under test
// is already configured with it.
export function createWasteTrackingStub() {
  let forcedStatusCode = null
  let port = 0
  let server

  const createServer = () => {
    const stub = Hapi.server({ host, port })

    stub.route({
      method: 'GET',
      path: '/next',
      handler: (_request, h) => {
        if (forcedStatusCode) {
          return h.response().code(forcedStatusCode)
        }

        return h.response({ wasteTrackingId: generateWasteTrackingId() })
      }
    })

    return stub
  }

  return {
    get baseUrl() {
      if (!port) {
        throw new Error('waste tracking stub has not been started')
      }
      return `http://${host}:${port}`
    },
    start: async () => {
      server = createServer()
      await server.start()
      port = server.info.port
    },
    stop: () => server.stop(),
    // Forces every subsequent GET /next to fail with statusCode, or clears
    // the override when called with no arguments / a falsy statusCode.
    respondWith: ({ statusCode } = {}) => {
      forcedStatusCode = statusCode || null
    }
  }
}
