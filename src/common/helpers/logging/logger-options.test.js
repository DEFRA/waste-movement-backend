import { loggerOptions } from './logger-options.js'
import {
  getClientId,
  getClientName,
  getOrganisationId,
  getOrganisationName
} from '../../../plugins/request-custom-logger.js'
import { getTraceId } from '@defra/hapi-tracing'

jest.mock('../../../plugins/request-custom-logger.js', () => ({
  getClientId: jest.fn(),
  getClientName: jest.fn(),
  getOrganisationId: jest.fn(),
  getOrganisationName: jest.fn()
}))

jest.mock('@defra/hapi-tracing', () => ({
  getTraceId: jest.fn()
}))

describe('loggerOptions', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('adds client id and client name to the tenant log context', () => {
    getClientId.mockReturnValue('client-123')
    getClientName.mockReturnValue('Client 123')

    expect(loggerOptions.mixin()).toEqual({
      tenant: {
        id: 'client-123',
        message: 'Client 123'
      }
    })
  })
  it('adds organisation and trace context when available', () => {
    getTraceId.mockReturnValue('trace-123')
    getOrganisationId.mockReturnValue('org-123')

    expect(loggerOptions.mixin()).toEqual({
      trace: {
        id: 'trace-123'
      },
      event: {
        reference: 'org-123'
      }
    })
  })
  it('adds the organisation name to event.reason when it is known', () => {
    getOrganisationId.mockReturnValue('org-123')
    getOrganisationName.mockReturnValue('Acme Waste Ltd')

    expect(loggerOptions.mixin()).toEqual({
      event: {
        reference: 'org-123',
        reason: 'Acme Waste Ltd'
      }
    })
  })
  it('logs no organisation name without an organisation id', () => {
    getOrganisationName.mockReturnValue('Acme Waste Ltd')

    expect(loggerOptions.mixin()).toEqual({})
  })
  it('keeps the mixin event.reference when a line logs its own event', () => {
    expect(
      loggerOptions.mixinMergeStrategy(
        { event: { action: 'movement-created' }, transaction: { id: 'M1' } },
        { event: { reference: 'org-123' }, tenant: { id: 'client-123' } }
      )
    ).toEqual({
      event: { reference: 'org-123', action: 'movement-created' },
      tenant: { id: 'client-123' },
      transaction: { id: 'M1' }
    })
  })
  it("lets a line's own values override the mixin's", () => {
    expect(
      loggerOptions.mixinMergeStrategy(
        { event: { reference: 'org-override' } },
        { event: { reference: 'org-123' } }
      )
    ).toEqual({ event: { reference: 'org-override' } })
  })
  it('only adds client name when no client id is available', () => {
    getClientId.mockReturnValue(null)
    getClientName.mockReturnValue('Client 123')

    expect(loggerOptions.mixin()).toEqual({
      tenant: {
        message: 'Client 123'
      }
    })
  })
})
