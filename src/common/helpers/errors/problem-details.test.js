import Joi from 'joi'
import Hapi from '@hapi/hapi'
import {
  ProblemDetails,
  toProblemDetails,
  toProblemDetailsResponse,
  failAction
} from './problem-details.js'
import { HTTP_STATUS } from '@defra/waste-movement-utils'

const insufficientFundsType = 'https://example.com/probs/insufficient-funds'
const insufficientFundsTitle = 'Insufficient Funds'
const insufficientFundsDetail = 'Your balance is 30, but the cost is 50.'
const cost = 50
const balance = 30
const orderInstance = '/orders/999'
const error = 'Something broke'
const basicError = 'Basic error'
const noOrderFound = 'No order exists with that id.'

describe('ProblemDetails', () => {
  it('sets standard fields from the constructor', () => {
    const problem = new ProblemDetails({
      type: insufficientFundsType,
      title: insufficientFundsTitle,
      status: HTTP_STATUS.FORBIDDEN,
      detail: insufficientFundsDetail,
      instance: '/accounts/123/transactions/abc'
    })

    expect(problem.type).toBe(insufficientFundsType)
    expect(problem.title).toBe(insufficientFundsTitle)
    expect(problem.status).toBe(HTTP_STATUS.FORBIDDEN)
    expect(problem.detail).toBe(insufficientFundsDetail)
    expect(problem.instance).toBe('/accounts/123/transactions/abc')
  })

  it('defaults type to "about:blank" when not provided', () => {
    const problem = new ProblemDetails({
      title: 'Oops',
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR
    })
    expect(problem.type).toBe('about:blank')
  })

  it('stores unknown fields as extensions', () => {
    const problem = new ProblemDetails({
      title: insufficientFundsTitle,
      status: HTTP_STATUS.FORBIDEN,
      balance,
      cost
    })

    expect(problem.extensions).toEqual({ balance, cost })
  })

  describe('toJSON()', () => {
    it('includes extensions and omits empty optional fields', () => {
      const problem = new ProblemDetails({
        title: insufficientFundsTitle,
        status: HTTP_STATUS.FORBIDEN,
        balance,
        cost
      })

      const json = problem.toJSON()

      expect(json).toEqual({
        type: 'about:blank',
        title: insufficientFundsTitle,
        status: HTTP_STATUS.FORBIDEN,
        balance,
        cost
      })
      expect(json.detail).toBeUndefined()
      expect(json.instance).toBeUndefined()
    })

    it('includes detail and instance when present', () => {
      const problem = new ProblemDetails({
        title: 'Not Found',
        status: HTTP_STATUS.NOT_FOUND,
        detail: 'No order with that id.',
        instance: orderInstance
      })

      expect(problem.toJSON()).toEqual({
        type: 'about:blank',
        title: 'Not Found',
        status: HTTP_STATUS.NOT_FOUND,
        detail: 'No order with that id.',
        instance: orderInstance
      })
    })
  })
})

describe('toProblemDetails', () => {
  it('returns the ProblemDetails JSON as-is when given one', () => {
    const problem = new ProblemDetails({
      type: 'https://example.com/probs/validation-error',
      title: 'Validation Failed',
      status: HTTP_STATUS.BAD_REQUEST,
      detail: 'Bad input.'
    })

    const result = toProblemDetails(problem)

    expect(result).toEqual(problem.toJSON())
  })

  it('converts a plain Error using defaults', () => {
    const err = new Error(error)

    const result = toProblemDetails(err)

    expect(result).toEqual({
      type: 'about:blank',
      title: 'Error',
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      detail: error
    })
  })

  it('uses a custom error name as the title', () => {
    const err = new Error(noOrderFound)
    err.name = 'NotFoundError'

    const result = toProblemDetails(err, { status: HTTP_STATUS.NOT_FOUND })

    expect(result.title).toBe('NotFoundError')
    expect(result.status).toBe(HTTP_STATUS.NOT_FOUND)
    expect(result.detail).toBe(noOrderFound)
  })

  it('includes instance when provided', () => {
    const err = new Error('Not Found')

    const result = toProblemDetails(err, {
      status: HTTP_STATUS.NOT_FOUND,
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
  let h
  let response

  beforeEach(() => {
    response = {
      code: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis()
    }

    h = {
      response: jest.fn().mockReturnValue(response)
    }
  })

  it('sets the response status code from the problem', () => {
    const err = new Error(noOrderFound)
    err.name = 'NotFoundError'

    toProblemDetailsResponse(h, err, { status: HTTP_STATUS.NOT_FOUND })

    expect(response.code).toHaveBeenCalledWith(HTTP_STATUS.NOT_FOUND)
  })

  it('sets Content-Type to application/problem+json', () => {
    const err = new Error(basicError)

    toProblemDetailsResponse(h, err, {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR
    })

    expect(response.type).toHaveBeenCalledWith('application/problem+json')
  })

  it('applies additional headers when provided', () => {
    const err = new Error('Too many requests, try again later.')
    err.name = 'RateLimitError'

    toProblemDetailsResponse(h, err, {
      status: HTTP_STATUS.BAD_REQUEST,
      instance: '/api/heavy-task',
      headers: { 'Retry-After': '30' }
    })

    expect(response.header).toHaveBeenCalledWith('Retry-After', '30')
    expect(response.code).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST)
  })

  it('builds the problem details payload passed to h.response', () => {
    const err = new Error(noOrderFound)
    err.name = 'NotFoundError'

    toProblemDetailsResponse(h, err, {
      status: HTTP_STATUS.BAD_REQUEST,
      instance: orderInstance
    })

    expect(h.response).toHaveBeenCalledWith({
      type: 'about:blank',
      title: 'NotFoundError',
      status: HTTP_STATUS.BAD_REQUEST,
      detail: noOrderFound,
      instance: orderInstance
    })
  })

  it('passes through a pre-built ProblemDetails error correctly', () => {
    const problemErr = new ProblemDetails({
      type: insufficientFundsType,
      title: insufficientFundsTitle,
      status: HTTP_STATUS.BAD_REQUEST,
      detail: insufficientFundsDetail,
      balance,
      cost
    })

    toProblemDetailsResponse(h, problemErr)

    expect(response.code).toHaveBeenCalledWith(HTTP_STATUS.BAD_REQUEST)
    expect(h.response).toHaveBeenCalledWith({
      type: insufficientFundsType,
      title: insufficientFundsTitle,
      status: HTTP_STATUS.BAD_REQUEST,
      detail: insufficientFundsDetail,
      balance,
      cost
    })
  })

  it('does not call header() when no headers are provided', () => {
    const err = new Error(basicError)

    toProblemDetailsResponse(h, err, { status: HTTP_STATUS.BAD_REQUEST })

    expect(response.header).not.toHaveBeenCalled()
  })

  it('returns the response object for hapi to use', () => {
    const err = new Error(basicError)

    const result = toProblemDetailsResponse(h, err, {
      status: HTTP_STATUS.BAD_REQUEST
    })

    expect(result).toBe(response)
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

    expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST)
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
      status: HTTP_STATUS.BAD_REQUEST,
      instance: '/users'
    })
  })

  it('includes invalid-params for each failing field', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/users',
      payload: {}
    })
    const body = JSON.parse(res.payload)

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

    expect(res.statusCode).toBe(HTTP_STATUS.OK)
    expect(JSON.parse(res.payload)).toEqual({ ok: true })
  })
})
