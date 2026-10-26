import Boom from '@hapi/boom'
import {
  findFutureReceiptDateTime,
  replaceEmptyReceiptDateTime,
  withReceiptDateTimeChecks
} from './receipt-date-time-checks.js'

const now = Date.parse('2026-10-14T09:30:00Z')

const required = {
  message: "'receiptDateTime' is required",
  path: ['receiptDateTime'],
  type: 'NotProvided'
}

const inTheFuture = {
  message: 'must not be in the future',
  path: ['receiptDateTime'],
  type: 'OutOfRange'
}

const formatError = {
  message: "must match format 'date-time'",
  path: ['receiptDateTime'],
  type: 'InvalidFormat'
}

const otherError = {
  message: "'carrier' is required",
  path: ['carrier'],
  type: 'NotProvided'
}

describe('replaceEmptyReceiptDateTime', () => {
  test('reports "" as required in place of the format error', () => {
    expect(
      replaceEmptyReceiptDateTime({ receiptDateTime: '' }, [
        otherError,
        formatError
      ])
    ).toEqual([otherError, required])
  })

  test.each([[undefined], ['Yesterday'], ['2026-10-14T09:30:00Z']])(
    'leaves the details alone when receiptDateTime is %j',
    (receiptDateTime) => {
      expect(
        replaceEmptyReceiptDateTime({ receiptDateTime }, [formatError])
      ).toEqual([formatError])
    }
  )
})

describe('findFutureReceiptDateTime', () => {
  test.each([
    ['2026-10-14T09:29:59Z'],
    ['2026-10-14T09:30:00Z'],
    // The same instant as now, given in BST.
    ['2026-10-14T10:30:00+01:00']
  ])('accepts %j, which is not later than now', (receiptDateTime) => {
    expect(findFutureReceiptDateTime({ receiptDateTime }, [], now)).toEqual([])
  })

  test.each([
    ['2026-10-14T09:30:01Z'],
    ['2026-10-14T09:30:00-01:00'],
    ['2099-01-01T09:00:00Z']
  ])('rejects %j, which is later than now', (receiptDateTime) => {
    expect(findFutureReceiptDateTime({ receiptDateTime }, [], now)).toEqual([
      inTheFuture
    ])
  })

  test('defaults to the current time', () => {
    expect(
      findFutureReceiptDateTime({ receiptDateTime: '2099-01-01T09:00:00Z' }, [])
    ).toEqual([inTheFuture])
  })

  test('leaves a value the schema rejected to the schema', () => {
    expect(
      findFutureReceiptDateTime(
        { receiptDateTime: '2099-01-01T09:00:00' },
        [formatError],
        now
      )
    ).toEqual([])
  })

  test.each([[undefined], [null], [{}]])(
    'leaves a payload of %j to the schema',
    (payload) => {
      expect(findFutureReceiptDateTime(payload, [], now)).toEqual([])
    }
  )
})

describe('withReceiptDateTimeChecks', () => {
  const passing = () => undefined
  const failingWith = (details) => () => {
    const error = Boom.badRequest('schema failed')
    error.details = details
    throw error
  }

  test('returns the payload when it passes the checks', () => {
    const payload = { receiptDateTime: '2026-01-15T14:45:00Z' }
    expect(withReceiptDateTimeChecks(passing)(payload)).toBe(payload)
  })

  test('reports a time in the future after the earlier errors', () => {
    const validate = withReceiptDateTimeChecks(failingWith([otherError]))

    expect(() => validate({ receiptDateTime: '2099-01-01T09:00:00Z' })).toThrow(
      expect.objectContaining({
        message: "'carrier' is required. must not be in the future",
        details: [otherError, inTheFuture]
      })
    )
  })

  test('reports "" as required, and not also as in the future', () => {
    const validate = withReceiptDateTimeChecks(failingWith([formatError]))

    expect(() => validate({ receiptDateTime: '' })).toThrow(
      expect.objectContaining({ details: [required] })
    )
  })

  test('rethrows an error that carries no validation details', () => {
    const unexpected = new Error('boom')
    const validate = withReceiptDateTimeChecks(() => {
      throw unexpected
    })

    expect(() => validate({})).toThrow(unexpected)
  })
})
