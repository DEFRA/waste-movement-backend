import { loggerOptions } from './logger-options.js'
import {
  getClientId,
  getClientName,
  getOrganisationId
} from '../../../plugins/request-custom-logger.js'
import { getTraceId } from '@defra/hapi-tracing'

jest.mock('../../../plugins/request-custom-logger.js', () => ({
  getClientId: jest.fn(),
  getClientName: jest.fn(),
  getOrganisationId: jest.fn()
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
