import { describe, test, expect, beforeAll, afterAll } from '@jest/globals'
import Hapi from '@hapi/hapi'
import { serviceAuth } from './service-auth.js'

describe('Service Auth Plugin', () => {
  let server
  const validClientId = 'test-client-id'
  const validAuthHeader = `Basic ${Buffer.from(`${validClientId}:`).toString('base64')}`

  beforeAll(async () => {
    server = Hapi.server()
    await server.register(serviceAuth)

    server.route({
      method: 'GET',
      path: '/protected',
      handler: (request) => ({
        message: 'success',
        clientId: request.auth.credentials.clientId
      })
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

  test('returns 401 when clientId (username) is empty', async () => {
    const emptyClientIdHeader = `Basic ${Buffer.from(':').toString('base64')}`
    const response = await server.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: emptyClientIdHeader
      }
    })

    expect(response.statusCode).toBe(401)
  })

  test('returns 200 when valid clientId is provided', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: validAuthHeader
      }
    })

    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({
      message: 'success',
      clientId: validClientId
    })
  })

  test('sets clientId in credentials from username', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/protected',
      headers: {
        authorization: validAuthHeader
      }
    })

    expect(response.statusCode).toBe(200)
    expect(response.result.clientId).toBe(validClientId)
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
