import { pino } from 'pino'
import { createLogger } from './logger.js'

jest.mock('pino', () => {
  const mockChildLogger = { child: jest.fn(), info: jest.fn() }
  const mockLoggerInstance = {
    child: jest.fn(() => mockChildLogger),
    info: jest.fn()
  }
  return {
    pino: jest.fn(() => mockLoggerInstance)
  }
})

jest.mock('./logger-options.js', () => ({
  loggerOptions: { level: 'info', mockOption: true }
}))

describe('createLogger', () => {
  const baseLoggerInstance = pino.mock.results[0].value

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('returns the base logger when called with no arguments', () => {
    const result = createLogger()

    expect(result).toBe(baseLoggerInstance)
    expect(baseLoggerInstance.child).not.toHaveBeenCalled()
  })

  it('returns the base logger when called with an empty object seed', () => {
    const result = createLogger({})

    expect(result).toBe(baseLoggerInstance)
    expect(baseLoggerInstance.child).not.toHaveBeenCalled()
  })

  it('returns a child logger when called with a non-empty seed object', () => {
    const seed = { apiVersion: 'beta-1' }

    const result = createLogger(seed)

    expect(baseLoggerInstance.child).toHaveBeenCalledTimes(1)
    expect(baseLoggerInstance.child).toHaveBeenCalledWith(seed)
    expect(result).toBe(baseLoggerInstance.child.mock.results[0].value)
  })

  it('creates a new child logger on each call with a non-empty seed', () => {
    const firstSeed = { apiVersion: 'beta-1' }
    const secondSeed = { another: 'seed' }
    createLogger(firstSeed)
    createLogger(secondSeed)

    expect(baseLoggerInstance.child).toHaveBeenCalledTimes(2)
    expect(baseLoggerInstance.child).toHaveBeenNthCalledWith(1, firstSeed)
    expect(baseLoggerInstance.child).toHaveBeenNthCalledWith(2, secondSeed)
  })

  it('treats a seed with keys but falsy/undefined values as non-empty (still calls child)', () => {
    const seed = { userId: undefined }

    const result = createLogger(seed)

    expect(baseLoggerInstance.child).toHaveBeenCalledWith(seed)
    expect(result).toBe(baseLoggerInstance.child.mock.results[0].value)
  })
})
