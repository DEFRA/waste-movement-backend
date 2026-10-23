import Hapi from '@hapi/hapi'
import Boom from '@hapi/boom'
import { betaJourneyLogger } from './beta-journey-logger.js'
import { findDeliveryMovementIds } from '../services/delivery.js'
import { createLogger } from '../common/helpers/logging/logger.js'

jest.mock('../common/helpers/logging/logger.js', () => {
  const logger = { info: jest.fn(), warn: jest.fn() }
  return { createLogger: () => logger }
})

const mockLogger = createLogger()

jest.mock('../services/delivery.js', () => ({
  findDeliveryMovementIds: jest.fn()
}))

// Each handler fails with the Boom error in payload.fail, if given
const respondWith = (body) => (request, h) => {
  const { fail } = request.payload ?? {}
  if (fail) {
    throw Boom[fail]('step failed')
  }
  return h.response(body(request)).code(201)
}

describe('betaJourneyLogger', () => {
  let server

  beforeAll(async () => {
    server = Hapi.server()
    await server.register(betaJourneyLogger)
    server.route([
      {
        method: 'POST',
        path: '/beta-2/movements',
        handler: respondWith(() => ({ data: { movementId: 'M1' } }))
      },
      {
        method: 'POST',
        path: '/beta-2/movements/{movementId}/collection',
        handler: respondWith(() => ({ data: null }))
      },
      {
        method: 'POST',
        path: '/beta-2/deliveries',
        handler: respondWith(({ payload }) => ({ data: payload.response }))
      },
      {
        method: 'POST',
        path: '/beta-2/deliveries/{deliveryId}/receipt',
        handler: respondWith(({ params }) => ({
          data: { deliveryId: params.deliveryId }
        }))
      },
      {
        method: 'POST',
        path: '/beta-2/receipts',
        handler: respondWith(() => ({ data: { deliveryId: 'D9' } }))
      },
      {
        method: 'POST',
        path: '/beta-1/movements',
        handler: respondWith(() => ({ data: { movementId: 'M1' } }))
      }
    ])
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(() => {
    jest.resetAllMocks()
  })

  const send = (url, payload = {}) =>
    server.inject({ method: 'POST', url, payload })

  const loggedLines = () =>
    mockLogger.info.mock.calls.map(([fields, message]) => ({
      fields,
      message
    }))

  describe('B1A - single non-hazardous movement', () => {
    it('logs the created movement', async () => {
      await send('/beta-2/movements')

      expect(loggedLines()).toEqual([
        {
          fields: {
            event: { action: 'movement-created', outcome: 'success' },
            transaction: { id: 'M1' }
          },
          message: 'Beta-2 movement-created: success (movement M1)'
        }
      ])
    })

    it('logs the collection against its movement', async () => {
      await send('/beta-2/movements/M1/collection')

      expect(loggedLines()).toEqual([
        {
          fields: {
            event: { action: 'collection-recorded', outcome: 'success' },
            transaction: { id: 'M1' }
          },
          message: 'Beta-2 collection-recorded: success (movement M1)'
        }
      ])
    })

    it('logs the receipt against each movement in the delivery', async () => {
      findDeliveryMovementIds.mockResolvedValue(['M1'])

      await send('/beta-2/deliveries/D1/receipt')

      expect(loggedLines()).toEqual([
        {
          fields: {
            event: { action: 'receipt-recorded', outcome: 'success' },
            transaction: { id: 'M1' },
            span: { id: 'D1' }
          },
          message: 'Beta-2 receipt-recorded: success (movement M1, delivery D1)'
        }
      ])
    })
  })

  describe('B1B / B2B - several movements delivered together', () => {
    it('logs one line per movement, each with the delivery it went into', async () => {
      await send('/beta-2/deliveries', {
        response: {
          deliveries: [
            { deliveryId: 'D1', movementIds: ['M1', 'M2'] },
            { deliveryId: 'M3', movementIds: ['M3'] }
          ]
        }
      })

      expect(loggedLines().map(({ fields }) => fields)).toEqual([
        {
          event: { action: 'delivery-recorded', outcome: 'success' },
          transaction: { id: 'M1' },
          span: { id: 'D1' }
        },
        {
          event: { action: 'delivery-recorded', outcome: 'success' },
          transaction: { id: 'M2' },
          span: { id: 'D1' }
        },
        {
          event: { action: 'delivery-recorded', outcome: 'success' },
          transaction: { id: 'M3' },
          span: { id: 'M3' }
        }
      ])
    })

    it('logs the receipt against every movement in the delivery', async () => {
      findDeliveryMovementIds.mockResolvedValue(['M1', 'M2'])

      await send('/beta-2/deliveries/D1/receipt')

      expect(findDeliveryMovementIds).toHaveBeenCalledWith(undefined, 'D1')
      expect(
        loggedLines().map(({ fields }) => [
          fields.transaction.id,
          fields.span.id
        ])
      ).toEqual([
        ['M1', 'D1'],
        ['M2', 'D1']
      ])
    })
  })

  describe('B1D - waste received without a Delivery ID', () => {
    it('logs the new delivery, with no movement', async () => {
      await send('/beta-2/receipts')

      expect(loggedLines()).toEqual([
        {
          fields: {
            event: {
              action: 'undocumented-receipt-recorded',
              outcome: 'success'
            },
            span: { id: 'D9' }
          },
          message: 'Beta-2 undocumented-receipt-recorded: success (delivery D9)'
        }
      ])
    })
  })

  describe('failures', () => {
    it('logs a rejected movement creation with its status and reason', async () => {
      await send('/beta-2/movements', { fail: 'badRequest' })

      expect(loggedLines()).toEqual([
        {
          fields: {
            event: { action: 'movement-created', outcome: 'failure' },
            error: { code: '400', message: 'step failed' }
          },
          message: 'Beta-2 movement-created: failure'
        }
      ])
    })

    it('logs a rejected collection against its movement', async () => {
      await send('/beta-2/movements/M1/collection', { fail: 'notFound' })

      expect(loggedLines()[0].fields).toEqual({
        event: { action: 'collection-recorded', outcome: 'failure' },
        transaction: { id: 'M1' },
        error: { code: '404', message: 'step failed' }
      })
    })

    it('logs a rejected delivery against each submitted movement', async () => {
      await send('/beta-2/deliveries', {
        fail: 'badRequest',
        movementIds: ['M1', 'M2', 'M1', 42]
      })

      expect(loggedLines().map(({ fields }) => fields.transaction.id)).toEqual([
        'M1',
        'M2'
      ])
      expect(loggedLines()[0].fields.event.outcome).toEqual('failure')
    })

    it('logs a receipt for an unknown delivery with the delivery id only', async () => {
      findDeliveryMovementIds.mockResolvedValue([])

      await send('/beta-2/deliveries/D404/receipt', { fail: 'notFound' })

      expect(loggedLines()[0].fields).toEqual({
        event: { action: 'receipt-recorded', outcome: 'failure' },
        span: { id: 'D404' },
        error: { code: '404', message: 'step failed' }
      })
    })

    it('still responds when the journey line cannot be logged', async () => {
      findDeliveryMovementIds.mockRejectedValue(new Error('mongo down'))

      const { statusCode } = await send('/beta-2/deliveries/D1/receipt')

      expect(statusCode).toEqual(201)
      expect(mockLogger.info).not.toHaveBeenCalled()
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'Failed to log beta-2 journey step'
      )
    })
  })

  it('logs nothing for routes outside beta-2', async () => {
    await send('/beta-1/movements')

    expect(mockLogger.info).not.toHaveBeenCalled()
  })
})
