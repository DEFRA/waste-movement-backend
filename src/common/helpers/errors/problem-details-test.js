import Joi from 'joi'
import Hapi from '@hapi/hapi'
import {
  ProblemDetails,
  toProblemDetails,
  toProblemDetailsResponse,
  failAction
} from './problem-details.js'

const createMockRes = () => {
  return {
    statusCode: null,
    headers: {},
    status(code) {
      this.statusCode = code
      return this
    },
    set(key, value) {
      this.headers[key] = value
      return this
    },
    json: jest.fn(function (body) {
      this.body = body
      return this
    })
  }
}

describe('ProblemDetails', () => {
  it('sets standard fields from the constructor', () => {
    const problem = new ProblemDetails({
      type: 'https://example.com/probs/insufficient-funds',
      title: 'Insufficient Funds',
      status: 403,
      detail: 'Your balance is 30, but the cost is 50.',
      instance: '/accounts/123/transactions/abc'
    })

    expect(problem.type).toBe('https://example.com/probs/insufficient-funds')
    expect(problem.title).toBe('Insufficient Funds')
    expect(problem.status).toBe(403)
    expect(problem.detail).toBe('Your balance is 30, but the cost is 50.')
    expect(problem.instance).toBe('/accounts/123/transactions/abc')
  })

  it('defaults type to "about:blank" when not provided', () => {
    const problem = new ProblemDetails({ title: 'Oops', status: 500 })
    expect(problem.type).toBe('about:blank')
  })

  it('stores unknown fields as extensions', () => {
    const problem = new ProblemDetails({
      title: 'Insufficient Funds',
      status: 403,
      balance: 30,
      cost: 50
    })

    expect(problem.extensions).toEqual({ balance: 30, cost: 50 })
  })

  describe('toJSON()', () => {
    it('includes extensions and omits empty optional fields', () => {
      const problem = new ProblemDetails({
        title: 'Insufficient Funds',
        status: 403,
        balance: 30,
        cost: 50
      })

      const json = problem.toJSON()

      expect(json).toEqual({
        type: 'about:blank',
        title: 'Insufficient Funds',
        status: 403,
        balance: 30,
        cost: 50
      })
      expect(json.detail).toBeUndefined()
      expect(json.instance).toBeUndefined()
    })

    it('includes detail and instance when present', () => {
      const problem = new ProblemDetails({
        title: 'Not Found',
        status: 404,
        detail: 'No order with that id.',
        instance: '/orders/999'
      })

      expect(problem.toJSON()).toEqual({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: 'No order with that id.',
        instance: '/orders/999'
      })
    })
  })
})

describe('toProblemDetails', () => {
  it('returns the ProblemDetails JSON as-is when given one', () => {
    const problem = new ProblemDetails({
      type: 'https://example.com/probs/validation-error',
      title: 'Validation Failed',
      status: 400,
      detail: 'Bad input.'
    })

    const result = toProblemDetails(problem)

    expect(result).toEqual(problem.toJSON())
  })

  it('converts a plain Error using defaults', () => {
    const err = new Error('Something broke')

    const result = toProblemDetails(err)

    expect(result).toEqual({
      type: 'about:blank',
      title: 'Error', // err.name defaults to "Error"
      status: 500,
      detail: 'Something broke'
    })
  })

  it('uses a custom error name as the title', () => {
    const err = new Error('No order exists with that id.')
    err.name = 'NotFoundError'

    const result = toProblemDetails(err, { status: 404 })

    expect(result.title).toBe('NotFoundError')
    expect(result.status).toBe(404)
    expect(result.detail).toBe('No order exists with that id.')
  })

  it('includes instance when provided', () => {
    const err = new Error('Rate limited')

    const result = toProblemDetails(err, {
      status: 429,
      instance: '/api/heavy-task'
    })

    expect(result.instance).toBe('/api/heavy-task')
  })

  it('omits instance when not provided', () => {
    const err = new Error('Server exploded')

    const result = toProblemDetails(err)

    expect(result.instance).toBeUndefined()
  })
})

describe('toProblemDetailsResponse', () => {
  let res

  beforeEach(() => {
    res = createMockRes()
  })

  it('sets the response status code from the problem', () => {
    const err = new Error('No order exists with that id.')
    err.name = 'NotFoundError'

    toProblemDetailsResponse(res, err, { status: 404 })

    expect(res.statusCode).toBe(404)
  })

  it('sets Content-Type to application/problem+json', () => {
    const err = new Error('Something broke')

    toProblemDetailsResponse(res, err, { status: 500 })

    expect(res.headers['Content-Type']).toBe('application/problem+json')
  })

  it('applies additional headers when provided', () => {
    const err = new Error('Too many requests, try again later.')
    err.name = 'RateLimitError'

    toProblemDetailsResponse(res, err, {
      status: 429,
      instance: '/api/heavy-task',
      headers: { 'Retry-After': '30' }
    })

    expect(res.headers['Retry-After']).toBe('30')
    expect(res.statusCode).toBe(429)
  })

  it('returns the problem details payload without calling res.json itself', () => {
    const err = new Error('No order exists with that id.')
    err.name = 'NotFoundError'

    const problem = toProblemDetailsResponse(res, err, {
      status: 404,
      instance: '/orders/999'
    })

    expect(problem).toEqual({
      type: 'about:blank',
      title: 'NotFoundError',
      status: 404,
      detail: 'No order exists with that id.',
      instance: '/orders/999'
    })
    expect(res.json).not.toHaveBeenCalled()
  })

  it('passes through a pre-built ProblemDetails error correctly', () => {
    const problemErr = new ProblemDetails({
      type: 'https://example.com/probs/insufficient-funds',
      title: 'Insufficient Funds',
      status: 403,
      detail: 'Your balance is 30, but the cost is 50.',
      balance: 30,
      cost: 50
    })

    const result = toProblemDetailsResponse(res, problemErr)

    expect(res.statusCode).toBe(403)
    expect(result).toEqual({
      type: 'https://example.com/probs/insufficient-funds',
      title: 'Insufficient Funds',
      status: 403,
      detail: 'Your balance is 30, but the cost is 50.',
      balance: 30,
      cost: 50
    })
  })

  it('does not set headers beyond Content-Type when none are passed', () => {
    const err = new Error('Basic error')

    toProblemDetailsResponse(res, err, { status: 400 })

    expect(Object.keys(res.headers)).toEqual(['Content-Type'])
  })
})
describe('toProblemDetails', () => {
  it('merges extensions into a plain error result', () => {
    const err = new Error('Your balance is too low.')
    err.name = 'InsufficientFundsError'

    const result = toProblemDetails(err, {
      status: 403,
      instance: '/accounts/123/transactions/abc',
      extensions: { balance: 30, cost: 50 }
    })

    expect(result).toEqual({
      type: 'about:blank',
      title: 'InsufficientFundsError',
      status: 403,
      detail: 'Your balance is too low.',
      instance: '/accounts/123/transactions/abc',
      balance: 30,
      cost: 50
    })
  })

  it('omits extensions key entirely when not provided (plain error)', () => {
    const err = new Error('Basic error')

    const result = toProblemDetails(err, { status: 400 })

    expect(result).toEqual({
      type: 'about:blank',
      title: 'Error',
      status: 400,
      detail: 'Basic error'
    })
  })

  it('merges call-time extensions on top of a ProblemDetails instance', () => {
    const problem = new ProblemDetails({
      title: 'Insufficient Funds',
      status: 403,
      detail: 'Your balance is 30, but the cost is 50.',
      balance: 30,
      cost: 50
    })

    // caller adds a field not present on the original instance
    const result = toProblemDetails(problem, {
      extensions: { retryable: false }
    })

    expect(result).toEqual({
      type: 'about:blank',
      title: 'Insufficient Funds',
      status: 403,
      detail: 'Your balance is 30, but the cost is 50.',
      balance: 30,
      cost: 50,
      retryable: false
    })
  })

  it('lets call-time extensions override matching fields (last write wins)', () => {
    const problem = new ProblemDetails({
      title: 'Insufficient Funds',
      status: 403,
      balance: 30
    })

    const result = toProblemDetails(problem, {
      extensions: { balance: 999 } // overrides the instance's own value
    })

    expect(result.balance).toBe(999)
  })

  it('does not mutate the original ProblemDetails instance when merging extensions', () => {
    const problem = new ProblemDetails({
      title: 'Insufficient Funds',
      status: 403,
      balance: 30
    })

    toProblemDetails(problem, { extensions: { balance: 999 } })

    // original instance's extensions object should be untouched
    expect(problem.extensions.balance).toBe(30)
  })
})

describe('toProblemDetailsResponse', () => {
  const res = createMockRes()
  it('passes extensions through to the returned payload', () => {
    const err = new Error('Your balance is too low.')
    err.name = 'InsufficientFundsError'

    const problem = toProblemDetailsResponse(res, err, {
      status: 403,
      instance: '/accounts/123/transactions/abc',
      extensions: { balance: 30, cost: 50 }
    })

    expect(problem).toEqual({
      type: 'about:blank',
      title: 'InsufficientFundsError',
      status: 403,
      detail: 'Your balance is too low.',
      instance: '/accounts/123/transactions/abc',
      balance: 30,
      cost: 50
    })
    // extensions shouldn't leak into headers or status handling
    expect(res.statusCode).toBe(403)
    expect(res.headers['Content-Type']).toBe('application/problem+json')
  })

  it('works with extensions and a ProblemDetails instance together', () => {
    const problemErr = new ProblemDetails({
      type: 'https://example.com/probs/insufficient-funds',
      title: 'Insufficient Funds',
      status: 403,
      balance: 30,
      cost: 50
    })

    const result = toProblemDetailsResponse(res, problemErr, {
      extensions: { retryable: false }
    })

    expect(result).toEqual({
      type: 'https://example.com/probs/insufficient-funds',
      title: 'Insufficient Funds',
      status: 403,
      balance: 30,
      cost: 50,
      retryable: false
    })
  })
})

describe('failAction', () => {
  let server

  beforeEach(async () => {
    server = Hapi.server()
    server.route({
      method: 'POST',
      path: '/users',
      options: {
        validate: {
          payload: Joi.object({
            email: Joi.string().email().required(),
            age: Joi.number().integer().min(0).required()
          }),
          failAction
        }
      },
      handler: () => ({ ok: true })
    })
    await server.initialize()
  })

  afterEach(async () => {
    await server.stop()
  })

  it('returns 400 status on invalid payload', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/users',
      payload: { email: 'not-an-email', age: -1 }
    })

    expect(res.statusCode).toBe(400)
  })

  it('sets content-type to application/problem+json', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/users',
      payload: { email: 'not-an-email', age: -1 }
    })

    expect(res.headers['content-type']).toMatch(/application\/problem\+json/)
  })

  it('returns RFC 9457 shaped body', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/users',
      payload: { email: 'not-an-email', age: 5 }
    })
    const body = JSON.parse(res.payload)

    expect(body).toMatchObject({
      type: 'https://example.com/errors/validation-error',
      title: expect.any(String),
      status: 400,
      instance: '/users'
    })
  })

  it('includes invalid-params for each failing field', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/users',
      payload: {} // both email and age missing
    })
    const body = JSON.parse(res.payload)

    // Note: Joi defaults to abortEarly, so only the first missing field
    // shows up unless the schema sets { abortEarly: false }.
    expect(Array.isArray(body['invalid-params'])).toBe(true)
    expect(body['invalid-params'].length).toBeGreaterThan(0)
    expect(body['invalid-params'][0]).toHaveProperty('name')
    expect(body['invalid-params'][0]).toHaveProperty('reason')
  })

  it('takeover() prevents hapi default error handling from running', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/users',
      payload: { email: 'bad', age: -1 }
    })
    const body = JSON.parse(res.payload)

    // Default hapi/Boom validation error shape has statusCode/error/message,
    // not our RFC 9457 shape — if takeover() were missing/broken, this would fail.
    expect(body).not.toHaveProperty('statusCode')
    expect(body).not.toHaveProperty('error')
    expect(body).toHaveProperty('type')
  })

  it('valid payload skips failAction and hits the handler', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/users',
      payload: { email: 'user@example.com', age: 30 }
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ ok: true })
  })
})
