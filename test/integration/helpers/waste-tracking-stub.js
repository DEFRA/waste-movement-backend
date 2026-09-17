import Hapi from '@hapi/hapi'
import { generateWasteTrackingId } from '@defra/waste-movement-utils'

// A real Hapi server standing in for waste-tracking-id-backend's GET /next -
// the one external dependency this suite doesn't run against the real service.
export function createWasteTrackingStub() {
  const url = new URL(process.env.WASTE_TRACKING_SERVICE_URL)
  let forcedStatusCode = null

  const server = Hapi.server({ host: url.hostname, port: Number(url.port) })

  server.route({
    method: 'GET',
    path: '/next',
    handler: (_request, h) => {
      if (forcedStatusCode) {
        return h.response().code(forcedStatusCode)
      }

      return h.response({ wasteTrackingId: generateWasteTrackingId() })
    }
  })

  return {
    start: () => server.start(),
    stop: () => server.stop(),
    // Forces every subsequent GET /next to fail with statusCode, or clears
    // the override when called with no arguments / a falsy statusCode.
    respondWith: ({ statusCode } = {}) => {
      forcedStatusCode = statusCode || null
    }
  }
}
