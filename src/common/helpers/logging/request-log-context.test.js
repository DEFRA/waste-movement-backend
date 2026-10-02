import Hapi from '@hapi/hapi'
import Boom from '@hapi/boom'
import hapiPino from 'hapi-pino'
import { Writable } from 'node:stream'
import { ecsFormat } from '@elastic/ecs-pino-format'
import { loggerOptions } from './logger-options.js'
import {
  CLIENT_NAME_HEADER,
  requestCustomLogger
} from '../../../plugins/request-custom-logger.js'
import { errorHandler } from '../../../plugins/error-handler.js'
import {
  forwardedOrganisationId,
  organisationHeaders
} from '../../../test/data/organisation-headers.js'

// The log lines as CDP receives them: the production logger options, in ECS
// format, with hapi-pino writing to an in-memory stream.
describe('request log context', () => {
  const clientId = 'test-client-id'
  const clientName = 'Test Software Ltd'
  const lines = []
  let server

  // As the external API sends them on a beta request
  const betaHeaders = {
    'x-dwt-client-id': clientId,
    [CLIENT_NAME_HEADER]: encodeURIComponent(clientName),
    ...organisationHeaders
  }

  beforeAll(async () => {
    const options = {
      ...loggerOptions,
      ...ecsFormat({ serviceName: 'test' }),
      enabled: true,
      level: 'info',
      stream: new Writable({
        write(chunk, _encoding, callback) {
          lines.push(chunk.toString())
          callback()
        }
      })
    }
    delete options.transport

    server = Hapi.server()
    await server.register([
      { plugin: hapiPino, options },
      requestCustomLogger,
      errorHandler
    ])

    const okHandler = (request) => {
      request.logger.info('handler line')
      return {}
    }
    const failHandler = () => {
      throw Boom.badRequest('the API Code supplied is invalid')
    }
    server.route([
      { method: 'POST', path: '/beta-1/movements', handler: okHandler },
      { method: 'POST', path: '/beta-1/fail', handler: failHandler },
      { method: 'POST', path: '/movements/receive', handler: okHandler },
      { method: 'POST', path: '/movements/fail', handler: failHandler }
    ])
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(() => {
    lines.length = 0
  })

  const send = (url, headers) =>
    server.inject({ method: 'POST', url, payload: {}, headers })

  const lineFor = (message) => {
    const raw = lines.find((line) =>
      JSON.parse(line).message?.startsWith(message)
    )
    expect(raw).toBeDefined()
    return { raw, line: JSON.parse(raw) }
  }

  // JSON.parse keeps only the last duplicate key, so count them in the raw line
  const keyCount = (raw, key) => raw.split(`"${key}":`).length - 1

  describe('beta routes', () => {
    it.each(['handler line', '[response] post /beta-1/movements'])(
      'adds tenant.id, the client name and event.reference to "%s"',
      async (message) => {
        await send('/beta-1/movements', betaHeaders)

        const { raw, line } = lineFor(message)
        expect(line.tenant).toEqual({ id: clientId, message: clientName })
        expect(line.event).toEqual({ reference: forwardedOrganisationId })
        expect(keyCount(raw, 'tenant')).toEqual(1)
        expect(keyCount(raw, 'event')).toEqual(1)
      }
    )

    it.each(['Request error', '[response] post /beta-1/fail'])(
      'adds tenant.id, the client name and event.reference to "%s" on an error',
      async (message) => {
        await send('/beta-1/fail', betaHeaders)

        const { line } = lineFor(message)
        expect(line.tenant).toEqual({ id: clientId, message: clientName })
        expect(line.event).toEqual({ reference: forwardedOrganisationId })
      }
    )

    it('leaves the client name out when the external API sent none', async () => {
      await send('/beta-1/movements', {
        'x-dwt-client-id': clientId,
        ...organisationHeaders
      })

      const { line } = lineFor('[response] post /beta-1/movements')
      expect(line.tenant).toEqual({ id: clientId })
    })
  })

  // Pins the current receipt of waste lines: none of this changes for RoW
  describe('receipt of waste routes (unchanged)', () => {
    const rowHeaders = {
      'x-dwt-client-id': clientId,
      // Never sent for RoW; ignored if it were
      [CLIENT_NAME_HEADER]: encodeURIComponent(clientName)
    }

    it('adds only tenant.id to lines written by the handler', async () => {
      await send('/movements/receive', rowHeaders)

      const { line } = lineFor('handler line')
      expect(line.tenant).toEqual({ id: clientId })
    })

    it('leaves "request completed" without tenant or event', async () => {
      await send('/movements/receive', rowHeaders)

      const { line } = lineFor('[response] post /movements/receive')
      expect(line).not.toHaveProperty('tenant')
      expect(line).not.toHaveProperty('event')
    })

    it('leaves "Request error" and "request completed" without tenant on an error', async () => {
      await send('/movements/fail', rowHeaders)

      expect(lineFor('Request error').line).not.toHaveProperty('tenant')
      expect(
        lineFor('[response] post /movements/fail').line
      ).not.toHaveProperty('tenant')
    })
  })
})
