import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import Hapi from '@hapi/hapi'
import { serviceAuth } from './service-auth.js'
import { config } from '../config.js'

describe('Service Auth Plugin', () => {
  let server
  const validToken = config.get('serviceAuthToken')
  const validAuthHeader = `Basic ${Buffer.from(`service:${validToken}`).toString('base64')}`

  beforeAll(async () => {
    server = Hapi.server()
    await server.register(serviceAuth)

    server.route({
      method: 'GET',
      path: '/protected',
      handler: () => ({ message: 'success' })
    })

    server.route({
      method: 'GET',
      path: '/unprotected',
      options: { auth: false },
      handler: () => ({ message: 'success' })
    })

    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  test('returns 401 when no authorization header is provided', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/protected'
    })

    expect(response.statusCode).toBe(401)
  })

  test('returns 401 when authorization header has invalid format', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: 'InvalidFormat'
      }
    })

    expect(response.statusCode).toBe(401)
  })

  test('returns 401 when token is invalid', async () => {
    const invalidAuthHeader = `Basic ${Buffer.from('service:invalid-token').toString('base64')}`
    const response = await server.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: invalidAuthHeader
      }
    })

    expect(response.statusCode).toBe(401)
  })

  test('returns 200 when valid token is provided', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: validAuthHeader
      }
    })

    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({ message: 'success' })
  })

  test('allows access to unprotected routes without auth', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/unprotected'
    })

    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({ message: 'success' })
  })
})
